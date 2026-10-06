"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDemoState } from "./demo-data";
import type { CartItem, OrderItem, OrderStatus, Payment, Product, RestaurantSettings, RestaurantState } from "./domain";

const STORAGE_KEY = "restaurante-mvp-v3";

type StoreContextValue = {
  state: RestaurantState;
  ready: boolean;
  createOrder: (tableId: string, cart: CartItem[], source: "waiter" | "qr") => { ok: true; number: number } | { ok: false; message: string };
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  cancelOrder: (orderId: string) => void;
  payTable: (tableId: string, payments: Payment[]) => void;
  adjustStock: (stockId: string, quantity: number, type: "Entrada" | "Ajuste" | "Perda") => void;
  toggleProduct: (productId: string) => void;
  updateSettings: (settings: RestaurantSettings) => void;
  resetDemo: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const recipeRequirements = (state: RestaurantState, cart: CartItem[]) => {
  const req = new Map<string, number>();
  for (const item of cart) {
    const product = state.products.find(p => p.id === item.productId);
    if (!product) continue;
    for (const component of product.recipe[item.variantId] ?? []) req.set(component.stockId, (req.get(component.stockId) ?? 0) + component.quantity * item.quantity);
  }
  return req;
};

const deriveTableStatus = (orders: RestaurantState["orders"], tableId: string) => {
  const active = orders.filter(o => o.tableId === tableId && !["completed", "cancelled"].includes(o.status));
  if (!active.length) return "available" as const;
  if (active.some(o => o.status === "ready")) return "ready" as const;
  if (active.some(o => o.status === "preparing" || o.status === "confirmed")) return "preparing" as const;
  return "occupied" as const;
};

export function RestaurantStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RestaurantState>(() => createDemoState());
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Loading persisted browser state after mount is intentional.
      if (saved) {
        const persisted = JSON.parse(saved) as RestaurantState;
        // Keep the operational history already created in this browser while
        // migrating only the old generic demo name to the restaurant brand.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(persisted.settings?.name === "Restaurante" ? { ...persisted, settings: { ...persisted.settings, name: "Patos Lanches" } } : persisted);
      }
    } catch { /* use demo data */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const channel = new BroadcastChannel(STORAGE_KEY); channel.postMessage(state); channel.close();
  }, [state, ready]);

  useEffect(() => {
    const channel = new BroadcastChannel(STORAGE_KEY);
    channel.onmessage = event => setState(event.data as RestaurantState);
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY && event.newValue) setState(JSON.parse(event.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => { channel.close(); window.removeEventListener("storage", onStorage); };
  }, []);

  const createOrder = useCallback((tableId: string, cart: CartItem[], source: "waiter" | "qr") => {
    const state = stateRef.current;
    if (!cart.length) return { ok: false as const, message: "Carrinho vazio" };
    for (const item of cart) {
      const product = state.products.find(p => p.id === item.productId);
      if (!product || !product.available) return { ok: false as const, message: `${product?.name ?? "Produto"} está indisponível` };
    }
    const requirements = recipeRequirements(state, cart);
    for (const [stockId, quantity] of requirements) {
      const stockItem = state.stock.find(s => s.id === stockId);
      if (!stockItem || stockItem.quantity < quantity) return { ok: false as const, message: `Estoque insuficiente: ${stockItem?.name ?? stockId}` };
    }
    const number = state.nextOrderNumber;
    const items: OrderItem[] = cart.map((cartItem, index) => {
      const product = state.products.find(p => p.id === cartItem.productId) as Product;
      const variant = product.variants.find(v => v.id === cartItem.variantId)!;
      return { id: `${number}-${index}`, productId: product.id, productName: product.name, variantId: variant.id, variantName: variant.name, sector: product.sector, quantity: cartItem.quantity, unitPrice: variant.price, addons: product.addons.filter(a => cartItem.addonIds.includes(a.id)), note: cartItem.note };
    });
    const orderId = `o${number}`;
    const now = new Date().toISOString();
    const updatedStock = state.stock.map(stockItem => ({ ...stockItem, quantity: Math.max(0, stockItem.quantity - (requirements.get(stockItem.id) ?? 0)) }));
    const movements = [...state.movements, ...[...requirements].map(([stockId, quantity], index) => ({ id: `${orderId}-mov-${index}`, stockId, type: "Venda" as const, quantity: -quantity, createdAt: now, reference: `Pedido #${number}` }))];
    setState({ ...state, nextOrderNumber: number + 1, stock: updatedStock, movements, orders: [...state.orders, { id: orderId, number, tableId, status: "confirmed", source, createdAt: now, items, stockApplied: true }], tables: state.tables.map(t => t.id === tableId ? { ...t, status: "preparing", openedAt: t.openedAt ?? now } : t) });
    return { ok: true as const, number };
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => setState(current => {
    const target = current.orders.find(o => o.id === orderId); if (!target) return current;
    const orders = current.orders.map(o => o.id === orderId ? { ...o, status } : o);
    return { ...current, orders, tables: current.tables.map(t => t.id === target.tableId ? { ...t, status: deriveTableStatus(orders, t.id) } : t) };
  }), []);

  const cancelOrder = useCallback((orderId: string) => setState(current => {
    const target = current.orders.find(o => o.id === orderId); if (!target || ["completed", "cancelled"].includes(target.status)) return current;
    const req = recipeRequirements(current, target.items.map((item, i) => ({ key: String(i), productId: item.productId, variantId: item.variantId, quantity: item.quantity, addonIds: item.addons.map(a => a.id), note: item.note })));
    const stock = target.stockApplied ? current.stock.map(s => ({ ...s, quantity: s.quantity + (req.get(s.id) ?? 0) })) : current.stock;
    const now = new Date().toISOString();
    const movements = target.stockApplied ? [...current.movements, ...[...req].map(([stockId, quantity], i) => ({ id: `${orderId}-refund-${i}`, stockId, type: "Estorno" as const, quantity, createdAt: now, reference: `Cancelamento #${target.number}` }))] : current.movements;
    const orders = current.orders.map(o => o.id === orderId ? { ...o, status: "cancelled" as const, stockApplied: false } : o);
    return { ...current, stock, movements, orders, tables: current.tables.map(t => t.id === target.tableId ? { ...t, status: deriveTableStatus(orders, t.id) } : t) };
  }), []);

  const payTable = useCallback((tableId: string, payments: Payment[]) => setState(current => {
    const activeOrders = current.orders.filter(o => o.tableId === tableId && !["completed", "cancelled"].includes(o.status));
    const subtotal = activeOrders.flatMap(o => o.items).reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.addons.reduce((a, b) => a + b.price, 0)), 0);
    const service = subtotal * current.settings.serviceRate / 100; const total = subtotal + service; const now = new Date().toISOString();
    return { ...current, orders: current.orders.map(o => activeOrders.some(a => a.id === o.id) ? { ...o, status: "completed" as const } : o), tables: current.tables.map(t => t.id === tableId ? { ...t, status: "available", openedAt: undefined } : t), sales: [...current.sales, { id: `sale-${Date.now()}`, tableId, orderIds: activeOrders.map(o => o.id), subtotal, service, total, payments, createdAt: now }] };
  }), []);

  const adjustStock = useCallback((stockId: string, quantity: number, type: "Entrada" | "Ajuste" | "Perda") => setState(current => {
    const delta = type === "Perda" ? -Math.abs(quantity) : quantity; const now = new Date().toISOString();
    return { ...current, stock: current.stock.map(s => s.id === stockId ? { ...s, quantity: Math.max(0, s.quantity + delta) } : s), movements: [...current.movements, { id: `mov-${Date.now()}`, stockId, type, quantity: delta, createdAt: now, reference: "Movimentação manual" }] };
  }), []);
  const toggleProduct = useCallback((productId: string) => setState(s => ({ ...s, products: s.products.map(p => p.id === productId ? { ...p, available: !p.available } : p) })), []);
  const updateSettings = useCallback((settings: RestaurantSettings) => setState(s => ({ ...s, settings })), []);
  const resetDemo = useCallback(() => setState(createDemoState()), []);

  const value = useMemo(() => ({ state, ready, createOrder, updateOrderStatus, cancelOrder, payTable, adjustStock, toggleProduct, updateSettings, resetDemo }), [state, ready, createOrder, updateOrderStatus, cancelOrder, payTable, adjustStock, toggleProduct, updateSettings, resetDemo]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRestaurant() { const value = useContext(StoreContext); if (!value) throw new Error("RestaurantStoreProvider ausente"); return value; }
