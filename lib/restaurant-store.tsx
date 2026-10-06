"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createDemoState } from "./demo-data";
import type { CartItem, Order, Payment, Product, RestaurantSettings, RestaurantState, TableStatus } from "./domain";

type KitchenTicket = {
  id: string; orderId: string; orderNumber: number; queueNumber: number; sector: string;
  status: "new" | "preparing" | "ready" | "cancelled"; fulfillment: "dine_in" | "pickup" | "delivery";
  tableNumber: number | null; customerName: string | null; estimatedMinutes: number | null; createdAt: string; notes: string | null;
  items: Array<{ productName: string; variantName: string; quantity: number; note: string | null }>;
};

type RemoteProduct = { id: string; name: string; description: string; category: string; sector: string; available: boolean; featured: boolean; variants: Array<{ id: string; name: string; priceCents: number }>; addons: Array<{ id: string; name: string; priceCents: number }> };
type Snapshot = {
  restaurant: { name: string; whatsapp: string; serviceRate: number };
  products: RemoteProduct[];
  tables: Array<{ number: number; active: boolean }>;
  orders: Array<{ id: string; orderNumber: number; source: "waiter" | "public_menu" | "qr_menu"; fulfillment: "dine_in" | "pickup" | "delivery"; status: Order["status"]; tableNumber: number | null; createdAt: string; items: Array<{ id: string; product_id: string | null; variant_id: string | null; product_name: string; variant_name: string; kitchen_sector: string; quantity: number; unit_price_cents: number; addons: Array<{ id: string; name: string; priceCents: number }>; note: string | null }> }>;
  kitchen: KitchenTicket[];
};

type PublicOrderInput = {
  source: "public_menu" | "qr_menu"; fulfillment: "dine_in" | "pickup" | "delivery"; tableNumber?: number;
  customer?: { name?: string; phone?: string }; notes?: string; items: CartItem[];
  delivery?: { addressLine1: string; addressLine2?: string; neighborhood?: string; city?: string; state?: string; postalCode?: string; reference?: string; latitude?: number; longitude?: number };
};

type Result = { ok: true; number: number } | { ok: false; message: string };

type StoreContextValue = {
  state: RestaurantState;
  kitchen: KitchenTicket[];
  ready: boolean;
  authenticated: boolean;
  refresh: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  createOrder: (tableId: string, cart: CartItem[], source?: "waiter" | "qr") => Promise<Result>;
  createPublicOrder: (input: PublicOrderInput) => Promise<Result>;
  cancelOrder: (orderId: string) => Promise<Result>;
  payTable: (tableId: string, payments: Payment[]) => Promise<{ ok: true; change: number } | { ok: false; message: string }>;
  updateKitchenTicket: (ticketId: string, status: "preparing" | "ready") => Promise<Result>;
  updateOrderStatus: (orderId: string, status: Order["status"]) => Promise<Result>;
  toggleProduct: (productId: string) => Promise<Result>;
  updateSettings: (settings: RestaurantSettings) => Promise<Result>;
  adjustStock: (stockId: string, quantity: number, type: "Entrada" | "Ajuste" | "Perda") => void;
  resetDemo: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const baseState = createDemoState();

function productFromRemote(product: RemoteProduct): Product {
  return {
    id: product.id, name: product.name, description: product.description, category: product.category, sector: product.sector as Product["sector"],
    available: product.available, featured: product.featured, recipe: {},
    variants: product.variants.map(variant => ({ id: variant.id, name: variant.name, price: variant.priceCents / 100 })),
    addons: product.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.priceCents / 100 })),
  };
}

function tableStatus(orders: Order[], tableId: string): TableStatus {
  const active = orders.filter(order => order.tableId === tableId && !["completed", "cancelled"].includes(order.status));
  if (!active.length) return "available";
  if (active.some(order => order.status === "ready")) return "ready";
  if (active.some(order => ["confirmed", "preparing"].includes(order.status))) return "preparing";
  return "occupied";
}

function stateFromSnapshot(snapshot: Snapshot, previous: RestaurantState): RestaurantState {
  const orders: Order[] = snapshot.orders.map(order => ({
    id: order.id, number: order.orderNumber, tableId: order.tableNumber ? String(order.tableNumber).padStart(2, "0") : `externo-${order.id}`,
    status: order.status, source: order.source === "waiter" ? "waiter" : "qr", createdAt: order.createdAt, stockApplied: false,
    items: order.items.map(item => ({
      id: item.id, productId: item.product_id ?? "", productName: item.product_name, variantId: item.variant_id ?? "", variantName: item.variant_name,
      sector: item.kitchen_sector as Product["sector"], quantity: item.quantity, unitPrice: item.unit_price_cents / 100,
      addons: item.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.priceCents / 100 })), note: item.note ?? undefined,
    })),
  }));
  const tables = snapshot.tables.map(table => {
    const id = String(table.number).padStart(2, "0");
    const firstActive = orders.find(order => order.tableId === id && !["completed", "cancelled"].includes(order.status));
    return { id, number: table.number, active: table.active, status: tableStatus(orders, id), openedAt: firstActive?.createdAt };
  });
  return {
    ...previous,
    settings: { name: snapshot.restaurant.name, whatsapp: snapshot.restaurant.whatsapp, serviceRate: snapshot.restaurant.serviceRate, tableCount: tables.length },
    products: snapshot.products.map(productFromRemote),
    tables,
    orders,
    sales: orders.filter(order => order.status === "completed").map(order => ({ id: `sale-${order.id}`, tableId: order.tableId, orderIds: [order.id], subtotal: order.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.addons.reduce((addons, addon) => addons + addon.price, 0)), 0), service: 0, total: order.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.addons.reduce((addons, addon) => addons + addon.price, 0)), 0), payments: [], createdAt: order.createdAt })),
    nextOrderNumber: Math.max(1, ...orders.map(order => order.number + 1)),
  };
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a ação.";
}

export function RestaurantStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RestaurantState>(baseState);
  const [kitchen, setKitchen] = useState<KitchenTicket[]>([]);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const loadPublicMenu = useCallback(async () => {
    const response = await fetch("/api/public/menu", { cache: "no-store" });
    if (!response.ok) return;
    const menu = await response.json() as { restaurant: { name: string; whatsapp: string | null }; products: RemoteProduct[] };
    setState(previous => ({ ...previous, settings: { ...previous.settings, name: menu.restaurant.name, whatsapp: menu.restaurant.whatsapp ?? "" }, products: menu.products.map(productFromRemote) }));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/operations/state", { cache: "no-store" });
    if (response.status === 401) { setAuthenticated(false); return false; }
    if (!response.ok) return false;
    const snapshot = await response.json() as Snapshot;
    setState(previous => stateFromSnapshot(snapshot, previous));
    setKitchen(snapshot.kitchen);
    setAuthenticated(true);
    return true;
  }, []);

  useEffect(() => {
    void (async () => {
      await loadPublicMenu();
      await refresh();
      setReady(true);
    })();
  }, [loadPublicMenu, refresh]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = window.setInterval(() => { void refresh(); }, 4_000);
    return () => window.clearInterval(interval);
  }, [authenticated, refresh]);

  const login = useCallback(async (username: string, password: string): Promise<Result> => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setKitchen([]);
  }, []);

  const createOrder = useCallback(async (tableId: string, cart: CartItem[], _source?: "waiter" | "qr"): Promise<Result> => {
    const response = await fetch("/api/operations/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tableNumber: Number(tableId), items: cart.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, addonIds: item.addonIds, note: item.note })) }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    const body = await response.json() as { order: { orderNumber: number } };
    await refresh();
    return { ok: true, number: body.order.orderNumber };
  }, [refresh]);

  const createPublicOrder = useCallback(async (input: PublicOrderInput): Promise<Result> => {
    const response = await fetch("/api/public/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, items: input.items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, addonIds: item.addonIds, note: item.note })) }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    const body = await response.json() as { order: { orderNumber: number } };
    return { ok: true, number: body.order.orderNumber };
  }, []);

  const cancelOrder = useCallback(async (orderId: string): Promise<Result> => {
    const response = await fetch(`/api/operations/orders/${orderId}`, { method: "DELETE" });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const payTable = useCallback(async (tableId: string, payments: Payment[]) => {
    const response = await fetch("/api/operations/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tableNumber: Number(tableId), payments: payments.map(payment => ({ method: payment.method, amountCents: Math.round(payment.amount * 100) })) }) });
    if (!response.ok) return { ok: false as const, message: await readError(response) };
    const body = await response.json() as { changeCents: number };
    await refresh();
    return { ok: true as const, change: body.changeCents / 100 };
  }, [refresh]);

  const updateKitchenTicket = useCallback(async (ticketId: string, status: "preparing" | "ready"): Promise<Result> => {
    const response = await fetch(`/api/internal/kitchen/${ticketId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const updateOrderStatus = useCallback(async (orderId: string, status: Order["status"]): Promise<Result> => {
    if (status === "delivered") return { ok: true, number: 0 };
    const ticket = kitchen.find(item => item.orderId === orderId && item.status !== "ready");
    if (!ticket || (status !== "preparing" && status !== "ready")) return { ok: false, message: "Não foi possível localizar a comanda da cozinha." };
    return updateKitchenTicket(ticket.id, status);
  }, [kitchen, updateKitchenTicket]);

  const toggleProduct = useCallback(async (productId: string): Promise<Result> => {
    const product = state.products.find(item => item.id === productId);
    if (!product) return { ok: false, message: "Produto não encontrado." };
    const response = await fetch(`/api/operations/products/${productId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ available: !product.available }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh, state.products]);

  const updateSettings = useCallback(async (settings: RestaurantSettings): Promise<Result> => {
    const response = await fetch("/api/operations/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: settings.name, whatsapp: settings.whatsapp, serviceRate: settings.serviceRate }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const adjustStock = useCallback((stockId: string, quantity: number, type: "Entrada" | "Ajuste" | "Perda") => {
    const delta = type === "Perda" ? -Math.abs(quantity) : quantity;
    setState(current => ({ ...current, stock: current.stock.map(item => item.id === stockId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item) }));
  }, []);

  const resetDemo = useCallback(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({ state, kitchen, ready, authenticated, refresh, login, logout, createOrder, createPublicOrder, cancelOrder, payTable, updateKitchenTicket, updateOrderStatus, toggleProduct, updateSettings, adjustStock, resetDemo }), [state, kitchen, ready, authenticated, refresh, login, logout, createOrder, createPublicOrder, cancelOrder, payTable, updateKitchenTicket, updateOrderStatus, toggleProduct, updateSettings, adjustStock, resetDemo]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRestaurant() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("RestaurantStoreProvider ausente");
  return value;
}
