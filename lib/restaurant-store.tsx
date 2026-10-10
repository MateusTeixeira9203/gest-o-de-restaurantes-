"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { CartItem, Order, Payment, Product, RestaurantSettings, RestaurantState, TableStatus } from "./domain";

type KitchenTicket = {
  id: string; orderId: string; orderNumber: number; queueNumber: number; sector: string;
  status: "new" | "preparing" | "ready" | "cancelled"; fulfillment: "dine_in" | "pickup" | "delivery";
  tableNumber: number | null; customerName: string | null; estimatedMinutes: number | null; createdAt: string; notes: string | null;
  items: Array<{ productName: string; variantName: string; quantity: number; note: string | null }>;
};

type RemoteProduct = { id: string; name: string; description: string; category: string; sector: string; available: boolean; featured: boolean; imageUrl: string | null; variants: Array<{ id: string; name: string; priceCents: number; stockAvailable: boolean }>; addons: Array<{ id: string; name: string; priceCents: number }> };
type Branding = { logoUrl: string | null; coverUrl: string | null };
type Snapshot = {
  restaurant: { name: string; whatsapp: string; serviceRate: number; plan: "essential"|"professional"; accentColor:string };
  branding: Branding;
  products: RemoteProduct[];
  tables: Array<{ number: number; label: string | null; active: boolean }>;
  orders: Array<{ id: string; revision: number; servedAt: string | null; orderNumber: number; source: "waiter" | "public_menu" | "qr_menu"; fulfillment: "dine_in" | "pickup" | "delivery"; status: Order["status"]; tableNumber: number | null; customerName: string | null; subtotalCents: number; serviceCents: number; totalCents: number; paidCents: number; payments: Array<{ method: "pix" | "cash" | "debit" | "credit"; amountCents: number }>; delivery: { addressLine1: string; neighborhood: string | null; reference: string | null } | null; createdAt: string; items: Array<{ id: string; product_id: string | null; variant_id: string | null; product_name: string; variant_name: string; kitchen_sector: string; quantity: number; unit_price_cents: number; addons: Array<{ id: string; name: string; priceCents: number }>; note: string | null }> }>;
  kitchen: KitchenTicket[];
  inventory: { enabled: boolean; items: Array<{ id: string; name: string; category: string; unit: "un" | "g" | "kg" | "ml" | "L"; quantity: number; minimumQuantity: number; averageCostCents: number; active: boolean }>; movements: Array<{ id: string; itemId: string; type: "initial" | "purchase" | "sale_consumption" | "cancellation_return" | "loss" | "adjustment"; quantityDelta: number; note: string | null; createdAt: string }>; recipes: Array<{ variantId: string; itemId: string; quantity: number }> };
};

type PublicOrderInput = {
  source: "public_menu" | "qr_menu"; fulfillment: "dine_in" | "pickup" | "delivery"; tableNumber?: number;
  customer?: { name?: string; phone?: string }; notes?: string; items: CartItem[];
  delivery?: { addressLine1: string; addressLine2?: string; neighborhood?: string; city?: string; state?: string; postalCode?: string; reference?: string; latitude?: number; longitude?: number };
};

type Result = { ok: true; number: number; role?: StaffRole } | { ok: false; message: string };
export type StaffRole = "admin" | "manager" | "waiter" | "kitchen" | "cashier" | "delivery";
type StaffSession = { username: string; role: StaffRole; staffId?: string | null };

type StoreContextValue = {
  state: RestaurantState;
  branding: Branding;
  kitchen: KitchenTicket[];
  ready: boolean;
  plan: "essential" | "professional";
  authenticated: boolean;
  session: StaffSession | null;
  refresh: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  createOrder: (tableId: string, cart: CartItem[], source?: "waiter" | "qr") => Promise<Result>;
  createPublicOrder: (input: PublicOrderInput) => Promise<Result>;
  reviewOrder: (orderId: string, revision: number, decision: "approve" | "reject", reason?: string) => Promise<Result>;
  cancelOrder: (orderId: string, reason: string) => Promise<Result>;
  payTable: (tableId: string, payments: Payment[]) => Promise<{ ok: true; change: number } | { ok: false; message: string }>;
  updateKitchenTicket: (ticketId: string, status: "preparing" | "ready") => Promise<Result>;
  updateDeliveryStatus: (orderId: string, status: "out_for_delivery" | "delivered") => Promise<Result>;
  updateOrderStatus: (orderId: string, status: Order["status"]) => Promise<Result>;
  toggleProduct: (productId: string) => Promise<Result>;
  updateSettings: (settings: RestaurantSettings) => Promise<Result>;
  createTable: (number: number) => Promise<Result>;
  createProduct: (input: { name: string; category: string; sector: string; price: number; description?: string }) => Promise<Result>;
  inventoryEnabled: boolean;
  setInventoryEnabled: (enabled: boolean) => Promise<Result>;
  createInventoryItem: (input: { name: string; category?: string; unit: "un" | "g" | "kg" | "ml" | "L"; quantity?: number; minimumQuantity?: number; cost?: number }) => Promise<Result>;
  moveInventory: (input: { itemId: string; type: "purchase" | "loss" | "adjustment"; quantity: number; cost?: number; note?: string }) => Promise<Result>;
  saveRecipe: (productId: string, variantId: string, components: Array<{ itemId: string; quantity: number }>) => Promise<Result>;
  resetDemo: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const baseState: RestaurantState = { settings: { name: "Gestor Food", whatsapp: "", serviceRate: 10, tableCount: 0 }, tables: [], products: [], orders: [], stock: [], movements: [], sales: [], nextOrderNumber: 1 };

function productFromRemote(product: RemoteProduct): Product {
  return {
    id: product.id, name: product.name, description: product.description, category: product.category, sector: product.sector as Product["sector"],
    available: product.available, featured: product.featured, imageUrl: product.imageUrl, recipe: {},
    variants: product.variants.map(variant => ({ id: variant.id, name: variant.name, price: variant.priceCents / 100, stockAvailable: variant.stockAvailable })),
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
  const recipesByVariant = Map.groupBy(snapshot.inventory.recipes, recipe => recipe.variantId);
  const orders: Order[] = snapshot.orders.map(order => ({
    id: order.id, revision: order.revision, servedAt: order.servedAt, subtotalCents: order.subtotalCents, serviceCents: order.serviceCents, totalCents: order.totalCents, paidCents: order.paidCents, number: order.orderNumber, tableId: order.tableNumber ? String(order.tableNumber).padStart(2, "0") : `externo-${order.id}`,
    status: order.status, source: order.source === "waiter" ? "waiter" : "qr", fulfillment: order.fulfillment, customerName: order.customerName ?? undefined, delivery: order.delivery ? { addressLine1: order.delivery.addressLine1, neighborhood: order.delivery.neighborhood ?? undefined, reference: order.delivery.reference ?? undefined } : undefined, paid: order.paidCents >= order.totalCents, createdAt: order.createdAt, stockApplied: false,
    items: order.items.map(item => ({
      id: item.id, productId: item.product_id ?? "", productName: item.product_name, variantId: item.variant_id ?? "", variantName: item.variant_name,
      sector: item.kitchen_sector as Product["sector"], quantity: item.quantity, unitPrice: item.unit_price_cents / 100,
      addons: item.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.priceCents / 100 })), note: item.note ?? undefined,
    })),
  }));
  const tables = snapshot.tables.map(table => {
    const id = String(table.number).padStart(2, "0");
    const firstActive = orders.find(order => order.tableId === id && !["completed", "cancelled"].includes(order.status));
    return { id, number: table.number, label: table.label || `Mesa ${id}`, active: table.active, status: tableStatus(orders, id), openedAt: firstActive?.createdAt };
  });
  return {
    ...previous,
    settings: { name: snapshot.restaurant.name, whatsapp: snapshot.restaurant.whatsapp, serviceRate: snapshot.restaurant.serviceRate, tableCount: tables.length },
    products: snapshot.products.map(product => ({ ...productFromRemote(product), recipe: Object.fromEntries(product.variants.map(variant => [variant.id, (recipesByVariant.get(variant.id) ?? []).map(component => ({ stockId: component.itemId, quantity: component.quantity }))])) })),
    tables,
    orders,
    sales: snapshot.orders.filter(order => order.status === "completed").map(order => ({ id: `sale-${order.id}`, tableId: order.tableNumber ? String(order.tableNumber).padStart(2, "0") : `externo-${order.id}`, orderIds: [order.id], subtotal: order.subtotalCents / 100, service: order.serviceCents / 100, total: order.totalCents / 100, payments: order.payments.map((payment, index) => ({ id: `payment-${order.id}-${index}`, method: ({ pix: "Pix", cash: "Dinheiro", debit: "Débito", credit: "Crédito" } as const)[payment.method], amount: payment.amountCents / 100 })), createdAt: order.createdAt })),
    nextOrderNumber: Math.max(1, ...orders.map(order => order.number + 1)),
    stock: snapshot.inventory.items.map(item => ({ id: item.id, name: item.name, category: item.category, unit: item.unit, quantity: item.quantity, minimum: item.minimumQuantity, cost: item.averageCostCents / 100 })),
    movements: snapshot.inventory.movements.map(movement => ({ id: movement.id, stockId: movement.itemId, type: movement.type === "purchase" || movement.type === "initial" ? "Entrada" : movement.type === "loss" ? "Perda" : movement.type === "cancellation_return" ? "Estorno" : movement.type === "sale_consumption" ? "Venda" : "Ajuste", quantity: movement.quantityDelta, createdAt: movement.createdAt, reference: movement.note ?? (movement.type === "sale_consumption" ? "Baixa por venda" : movement.type === "cancellation_return" ? "Estorno de pedido" : "Movimentação de estoque") })),
  };
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a ação.";
}

export function RestaurantStoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const orderRequests = useRef(new Map<string, string>());
  const postOrder = useCallback(async (url:string, payload:unknown):Promise<Result> => {
    const body = JSON.stringify(payload);
    const intent = url + body;
    const key = orderRequests.current.get(intent) ?? crypto.randomUUID();
    orderRequests.current.set(intent, key);
    try {
      const response = await fetch(url, {method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body});
      if (!response.ok) return {ok:false,message:await readError(response)};
      const result = await response.json() as {order:{orderNumber:number}};
      orderRequests.current.delete(intent);
      return {ok:true,number:result.order.orderNumber};
    } catch {return {ok:false,message:"Conexão interrompida. Tente novamente para consultar o mesmo pedido."};}
  }, []);
  const publicMenuPage = pathname.startsWith("/menu");
  const [state, setState] = useState<RestaurantState>(baseState);
  const [branding, setBranding] = useState<Branding>({ logoUrl: null, coverUrl: null });
  const [kitchen, setKitchen] = useState<KitchenTicket[]>([]);
  const [ready, setReady] = useState(false);
  const [plan,setPlan]=useState<"essential"|"professional">("essential");
  const [accent,setAccent]=useState("#171814");
  useEffect(()=>{document.documentElement.style.setProperty("--brand-accent",accent);const rgb=accent.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;document.documentElement.style.setProperty("--brand-on-accent",luminance>.179?"#111111":"#ffffff");},[accent]);
  const [authenticated, setAuthenticated] = useState(false);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [inventoryEnabled, setInventoryEnabledState] = useState(false);

  const loadPublicMenu = useCallback(async () => {
    const response = await fetch("/api/public/menu", { cache: "no-store" });
    if (!response.ok) return;
    const menu = await response.json() as { restaurant: { name: string; whatsapp: string | null; accentColor:string }; branding: Branding; products: RemoteProduct[] };
    setAccent(menu.restaurant.accentColor);
    setBranding(menu.branding ?? { logoUrl: null, coverUrl: null });
    setState(previous => ({ ...previous, settings: { ...previous.settings, name: menu.restaurant.name, whatsapp: menu.restaurant.whatsapp ?? "" }, products: menu.products.map(productFromRemote) }));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/operations/state", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { setAuthenticated(false); setSession(null); return false; }
    if (!response.ok) return false;
    const snapshot = await response.json() as Snapshot;
    setPlan(snapshot.restaurant.plan);setAccent(snapshot.restaurant.accentColor);
    setBranding(snapshot.branding ?? { logoUrl: null, coverUrl: null });
    setState(previous => stateFromSnapshot(snapshot, previous));
    setKitchen(snapshot.kitchen);
    setInventoryEnabledState(snapshot.inventory.enabled);
    setAuthenticated(true);
    return true;
  }, []);

  useEffect(() => {
    void (async () => {
      if (publicMenuPage) { await loadPublicMenu(); setReady(true); return; }
      await loadPublicMenu();
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const current = await response.json().catch(() => null) as { authenticated?: boolean; username?: string | null; role?: StaffRole | null; staffId?: string | null } | null;
      if (current?.authenticated && current.username && current.role) {
        setSession({ username: current.username, role: current.role, staffId: current.staffId });
        await refresh();
      }
      setReady(true);
    })();
  }, [loadPublicMenu, publicMenuPage, refresh]);

  useEffect(() => {
    if (!authenticated || publicMenuPage) return;
    const intervalMs = pathname.startsWith("/operacao") ? 4_000 : pathname === "/gestao/pedidos" ? 8_000 : 20_000;
    let stopped = false;
    let timer: number;
    const poll = async () => {
      if (document.visibilityState === "visible") await refresh().catch(() => false);
      if (!stopped) timer = window.setTimeout(poll, intervalMs);
    };
    timer = window.setTimeout(poll, intervalMs);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [authenticated, pathname, publicMenuPage, refresh]);

  const login = useCallback(async (username: string, password: string): Promise<Result> => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    const user = await response.json() as { username: string; role: StaffRole; staffId?: string };
    setSession({ username: user.username, role: user.role, staffId: user.staffId });
    await refresh();
    return { ok: true, number: 0, role: user.role };
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setSession(null);
    setKitchen([]);
  }, []);

  const createOrder = useCallback(async (tableId:string, cart:CartItem[]):Promise<Result> => {
    const result=await postOrder("/api/operations/orders",{tableNumber:Number(tableId),sendToKitchen:true,items:cart.map(item=>({productId:item.productId,variantId:item.variantId,quantity:item.quantity,addonIds:item.addonIds,note:item.note}))});
    if(result.ok) await refresh();
    return result;
  },[postOrder,refresh]);

  const createPublicOrder=useCallback(async(input:PublicOrderInput):Promise<Result>=>postOrder("/api/public/orders",{...input,items:input.items.map(item=>({productId:item.productId,variantId:item.variantId,quantity:item.quantity,addonIds:item.addonIds,note:item.note}))}),[postOrder]);

  const reviewOrder=useCallback(async(orderId:string,revision:number,decision:"approve"|"reject",reason?:string):Promise<Result>=>{
    try {
      const response=await fetch(`/api/operations/orders/${orderId}/approval`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({revision,decision,reason})});
      if(!response.ok) return {ok:false,message:await readError(response)};
      await refresh();return {ok:true,number:0};
    } catch{return {ok:false,message:"Não foi possível confirmar. Atualize a lista antes de tentar novamente."};}
  },[refresh]);

  const cancelOrder = useCallback(async (orderId: string, reason: string): Promise<Result> => {
    const response = await fetch(`/api/operations/orders/${orderId}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const payTable = useCallback(async (tableId: string, payments: Payment[]) => {
    const payload=JSON.stringify({tableNumber:Number(tableId),payments:payments.map(payment=>({method:payment.method,amountCents:Math.round(payment.amount*100)}))});
    const intent="table-payment:"+payload;
    const key=orderRequests.current.get(intent)??crypto.randomUUID();orderRequests.current.set(intent,key);
    const response = await fetch("/api/operations/payments", { method: "POST", headers: { "content-type": "application/json", "idempotency-key":key }, body: payload });
    if (!response.ok) return { ok: false as const, message: await readError(response) };
    const body = await response.json() as { changeCents: number };
    orderRequests.current.delete(intent);
    await refresh();
    return { ok: true as const, change: body.changeCents / 100 };
  }, [refresh]);

  const updateKitchenTicket = useCallback(async (ticketId: string, status: "preparing" | "ready"): Promise<Result> => {
    const response = await fetch(`/api/internal/kitchen/${ticketId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh();
    return { ok: true, number: 0 };
  }, [refresh]);

  const updateDeliveryStatus = useCallback(async (orderId: string, status: "out_for_delivery" | "delivered"): Promise<Result> => {
    const response = await fetch(`/api/operations/deliveries/${orderId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const updateOrderStatus = useCallback(async (orderId: string, status: Order["status"]): Promise<Result> => {
    if (status === "delivered") {
      const response=await fetch(`/api/operations/orders/${orderId}/serve`,{method:"POST"});
      if(!response.ok)return {ok:false,message:await readError(response)};
      await refresh();return {ok:true,number:0};
    }
    const ticket = kitchen.find(item => item.orderId === orderId && item.status !== "ready");
    if (!ticket || (status !== "preparing" && status !== "ready")) return { ok: false, message: "Não foi possível localizar a comanda da cozinha." };
    return updateKitchenTicket(ticket.id, status);
  }, [kitchen, updateKitchenTicket, refresh]);

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

  const createTable = useCallback(async (number: number): Promise<Result> => {
    const response = await fetch("/api/operations/tables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ number }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number };
  }, [refresh]);

  const createProduct = useCallback(async (input: { name: string; category: string; sector: string; price: number; description?: string }): Promise<Result> => {
    const response = await fetch("/api/operations/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: input.name, category: input.category, sector: input.sector, description: input.description ?? "", variants: [{ name: "Padrão", priceCents: Math.round(input.price * 100) }], addons: [] }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const setInventoryEnabled = useCallback(async (enabled: boolean): Promise<Result> => {
    const response = await fetch("/api/operations/inventory/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const createInventoryItem = useCallback(async (input: { name: string; category?: string; unit: "un" | "g" | "kg" | "ml" | "L"; quantity?: number; minimumQuantity?: number; cost?: number }): Promise<Result> => {
    const response = await fetch("/api/operations/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, unitCostCents: input.cost === undefined ? undefined : Math.round(input.cost * 100) }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const moveInventory = useCallback(async (input: { itemId: string; type: "purchase" | "loss" | "adjustment"; quantity: number; cost?: number; note?: string }): Promise<Result> => {
    const response = await fetch("/api/operations/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "movement", ...input, unitCostCents: input.cost === undefined ? undefined : Math.round(input.cost * 100) }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const saveRecipe = useCallback(async (productId: string, variantId: string, components: Array<{ itemId: string; quantity: number }>): Promise<Result> => {
    const response = await fetch(`/api/operations/products/${productId}/recipe`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ variantId, components }) });
    if (!response.ok) return { ok: false, message: await readError(response) };
    await refresh(); return { ok: true, number: 0 };
  }, [refresh]);

  const resetDemo = useCallback(() => { void refresh(); }, [refresh]);

  const value = useMemo<StoreContextValue>(() => ({ state, branding, kitchen, ready, plan, authenticated, session, refresh, login, logout, createOrder, createPublicOrder, reviewOrder, cancelOrder, payTable, updateKitchenTicket, updateDeliveryStatus, updateOrderStatus, toggleProduct, updateSettings, createTable, createProduct, inventoryEnabled, setInventoryEnabled, createInventoryItem, moveInventory, saveRecipe, resetDemo }), [state, branding, kitchen, ready, plan, authenticated, session, refresh, login, logout, createOrder, createPublicOrder, reviewOrder, cancelOrder, payTable, updateKitchenTicket, updateDeliveryStatus, updateOrderStatus, toggleProduct, updateSettings, createTable, createProduct, inventoryEnabled, setInventoryEnabled, createInventoryItem, moveInventory, saveRecipe, resetDemo]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRestaurant() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("RestaurantStoreProvider ausente");
  return value;
}
