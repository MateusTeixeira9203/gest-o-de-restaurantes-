"use client";
import { FiscalWorkspace } from "./fiscal-workspace";
import { FinanceWorkspace, CashShiftPanel } from "./finance-workspace";
import { ServedOrderButton } from "./served-order-button";
import { CostManagement } from "./cost-management";
import { RefundOrderButton } from "./refund-order-button";
import { PendingOrders } from "./pending-orders";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Bike, Boxes, Check, ChefHat, ChevronRight, CircleDollarSign,
  CookingPot, Copy, CreditCard, FileBarChart, LayoutDashboard, LockKeyhole, LogOut,
  MapPin, Menu as MenuIcon, Minus, Plus, ReceiptText, Search, Settings, ShoppingBag,
  Sparkles, Table2, TrendingUp, UtensilsCrossed, UsersRound, WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RestaurantStoreProvider, type StaffRole, useRestaurant } from "@/lib/restaurant-store";
import { InventoryManagement } from "@/components/inventory-management";
import { TeamManagement } from "@/components/team-management";
import { ManagementMenu } from "@/components/management-menu";
import { ManagementTables } from "@/components/management-tables";
import { ManagementSettings } from "@/components/management-settings";
import { CustomerCheckoutDialog, type CustomerCheckoutValue } from "@/components/customer-checkout-dialog";
import { KitchenBoard } from "@/components/kitchen-board";
import { AccountCheckout } from "@/components/account-checkout";
import { CashierOnlineOrders, ExternalPaymentAction } from "@/components/external-payment";
import type { CartItem, Order, OrderStatus, Product, RestaurantState, TableStatus } from "@/lib/domain";
import { money, orderTotal, tableTotal } from "@/lib/domain";

const TABLE_STATUS: Record<TableStatus, { label: string; cls: string }> = {
  available: { label: "Livre", cls: "status-free" }, occupied: { label: "Ocupada", cls: "status-occupied" }, preparing: { label: "Preparando", cls: "status-preparing" }, ready: { label: "Pedido pronto", cls: "status-ready" }, closing: { label: "Aguardando conta", cls: "status-closing" },
};
const ORDER_STATUS: Record<OrderStatus, string> = { pending: "Pendente", confirmed: "Na fila", preparing: "Em preparo", ready: "Pronto para entregar", out_for_delivery: "Em entrega", delivered: "Entregue", completed: "Concluído", cancelled: "Cancelado" };


function Topbar({ title, subtitle, back = "/operacao", action }: { title: string; subtitle?: string; back?: string; action?: React.ReactNode }) {
  return <header className="topbar"><div className="flex min-w-0 items-center gap-3"><Link href={back} className="icon-button" aria-label="Voltar"><ArrowLeft size={19} /></Link><div className="min-w-0"><h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-0.5 truncate text-sm text-neutral-500">{subtitle}</p>}</div></div>{action}</header>;
}

function StatusPill({ status }: { status: TableStatus }) { const meta = TABLE_STATUS[status]; return <span className={`status-pill ${meta.cls}`}><span />{meta.label}</span>; }
function OrderPill({ status }: { status: OrderStatus }) { return <span className={`order-pill order-${status}`}>{ORDER_STATUS[status]}</span>; }
function Elapsed({ date }: { date: string }) { const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(date)); return <span>{time}</span>; }

function OperationHome() {
  const { session, logout } = useRestaurant();
  const areas = [
    { href: "/operacao/garcom", role: "waiter", label: "Garçom", note: "Mesas e comandas", icon: UtensilsCrossed, tone: "lime" },
    { href: "/operacao/cozinha", role: "kitchen", label: "Cozinha", note: "Fila de produção", icon: ChefHat, tone: "amber" },
    { href: "/operacao/caixa", role: "cashier", label: "Caixa", note: "Contas e pagamentos", icon: CircleDollarSign, tone: "blue" },
    { href: "/operacao/entregas", role: "delivery", label: "Entregas", note: "Rotas e pedidos prontos", icon: Bike, tone: "amber" },
    { href: "/gestao/dashboard", role: "manager", label: "Gestão", note: "Indicadores e controle", icon: LayoutDashboard, tone: "violet" },
  ];
  const visibleAreas = session?.role === "admin" || session?.role === "manager" ? areas : areas.filter(area => area.role === session?.role);
  return <main className="operation-entry"><div className="entry-shell"><header className="flex items-center justify-between border-b border-white/10 pb-6"><Brand dark /><div className="flex items-center gap-3"><Link href="/menu" className="entry-link">Abrir cardápio</Link>{session && <button onClick={() => void logout()} className="entry-link">Trocar usuário</button>}</div></header><section className="flex flex-1 flex-col justify-center py-12"><div className="mb-10 max-w-2xl"><span className="live-pill"><span /> Acesso da equipe</span><h1 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-.045em] sm:text-6xl">{session ? `Olá, ${session.username}.` : "Onde você vai trabalhar agora?"}</h1><p className="mt-4 text-lg text-white/50">{session ? "Sua área de trabalho está pronta para o turno." : "Escolha uma área para entrar. Garçom, cozinha e caixa têm acesso direto."}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visibleAreas.map(({ href, label, note, icon: Icon, tone }) => <Link key={href} href={href} className="entry-card"><div className={`icon-tile icon-${tone}`}><Icon size={20} /></div><div className="mt-8 flex items-end justify-between"><div><h2 className="text-lg font-semibold">{label}</h2><p className="mt-1 text-sm text-white/45">{note}</p></div><ArrowRight size={19} className="text-white/30" /></div></Link>)}</div></section><footer className="flex justify-between border-t border-white/10 pt-5 text-xs text-white/35"><span>Gestor Food</span><span>Sincronização ativa</span></footer></div></main>;
}

function Brand({ dark = false, subtitle = "Operação & gestão" }: { dark?: boolean; subtitle?: string }) { const { state, branding } = useRestaurant(); return <div className="flex items-center gap-3"><span className="brand-mark"><Image src={branding.logoUrl || "/gestor-food-mark.svg"} alt={`Logo de ${state.settings.name}`} width={112} height={112} priority unoptimized={Boolean(branding.logoUrl)} className="brand-logo" /></span><div><p className={`font-semibold tracking-tight ${dark ? "text-white" : "text-[#171814]"}`}>{state.settings.name}</p><p className={`text-xs ${dark ? "text-white/40" : "text-neutral-500"}`}>{subtitle}</p></div></div>; }

function WaiterTables() {
  const { state } = useRestaurant();
  const summary = [
    ["Livres", state.tables.filter(t => t.status === "available").length], ["Em atendimento", state.tables.filter(t => ["occupied", "preparing"].includes(t.status)).length], ["Prontos", state.tables.filter(t => t.status === "ready").length], ["Fechamento", state.tables.filter(t => t.status === "closing").length],
  ];
  return <main className="app-page"><div className="page-container"><Topbar title="Salão" subtitle="Selecione o número para abrir a mesa ou comanda" action={<div className="hidden items-center gap-2 sm:flex"><span className="sync-dot" /> <span className="text-sm text-neutral-500">Ao vivo</span></div>} /><PendingOrders /><div className="summary-strip">{summary.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="mb-4 flex items-center justify-between"><h2 className="section-title">Mesas</h2><span className="text-sm text-neutral-500">{state.tables.filter(t => t.active).length} ativas</span></div><section className="table-grid">{state.tables.filter(t => t.active).map(table => { const orders = state.orders.filter(o => o.tableId === table.id && !["cancelled", "completed"].includes(o.status)); const total = tableTotal(state, table.id); return <Link key={table.id} href={`/operacao/garcom/mesa/${table.id}`} className={`table-card table-${table.status}`}><div className="flex items-start justify-between"><span className="table-number">{String(table.number).padStart(2, "0")}</span>{table.status === "ready" && <Bell size={18} className="text-emerald-600" />}</div><div className="mt-8"><StatusPill status={table.status} />{table.status !== "available" ? <><p className="mt-3 text-lg font-semibold">{money(total)}</p><p className="mt-1 text-xs text-neutral-500">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p></> : <p className="mt-3 text-sm text-neutral-400">Disponível para abrir</p>}</div></Link>; })}</section></div></main>;
}

function CancelOrderButton({ order }: { order: Order }) {
  const { cancelOrder } = useRestaurant(); const [open, setOpen] = useState(false); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); const result = await cancelOrder(order.id, note.trim() || "Cancelamento confirmado"); setBusy(false); if (!result.ok) { toast.error(result.message); return; } setOpen(false); setNote(""); toast.success("Pedido cancelado e cozinha avisada."); };
  return <><button onClick={() => setOpen(true)} className="text-red-600 hover:underline">Cancelar</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>Cancelar pedido #{order.number}?</DialogTitle><DialogDescription>{order.status === "preparing" || order.status === "ready" ? "A cozinha será avisada imediatamente. Confirme somente se o pedido realmente não deve seguir." : "O pedido será removido da fila da cozinha imediatamente."}</DialogDescription></DialogHeader><div className="space-y-4"><label><span>Observação (opcional)</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={160} placeholder="Ex.: cliente desistiu" /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="secondary-button">Voltar</button><button type="button" onClick={() => void confirm()} disabled={busy} className="primary-button bg-red-600 hover:bg-red-700">{busy ? "Cancelando…" : "Confirmar cancelamento"}</button></div></div></DialogContent></Dialog></>;
}

function TableCommand({ tableId }: { tableId: string }) {
  const { state } = useRestaurant(); const [adding, setAdding] = useState(false); const [checkout, setCheckout] = useState(false);
  const table = state.tables.find(t => t.id === tableId); const orders = state.orders.filter(o => o.tableId === tableId && o.status !== "cancelled" && o.status !== "completed");
  if (!table) return <NotFound />;
  if (adding) return <MenuBuilder tableId={tableId} source="waiter" onBack={() => setAdding(false)} onSent={() => setAdding(false)} />;
  if (checkout) return <AccountCheckout tableId={tableId} onBack={() => setCheckout(false)} />;
  const total = tableTotal(state, tableId);
return <main className="app-page"><div className="page-container max-w-4xl"><Topbar title={table.label || `Mesa / comanda ${String(table.number).padStart(2, "0")}`} subtitle={table.openedAt ? `Aberta às ${new Date(table.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sem atendimento aberto"} back="/operacao/garcom" action={<StatusPill status={table.status} />} />{orders.some(o => o.status === "ready") && <div className="ready-banner"><div className="ready-icon"><Bell size={20} /></div><div><strong>Pedido pronto para retirar</strong><p>A cozinha finalizou o pedido #{orders.find(o => o.status === "ready")?.number}.</p></div></div>}<section className="command-card"><div className="flex items-center justify-between border-b border-neutral-200 p-5 sm:p-6"><div><h2 className="section-title">Comanda</h2><p className="mt-1 text-sm text-neutral-500">{orders.length ? `${orders.length} pedido(s) ativo(s)` : "Nenhum pedido nesta conta"}</p></div><button onClick={() => setAdding(true)} className="primary-button"><Plus size={18} /> Adicionar pedido</button></div><div className="divide-y divide-neutral-100">{orders.map(order => <div key={order.id} className="p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="order-number">#{order.number}</span><OrderPill status={order.status} /></div><div className="flex items-center gap-3 text-xs text-neutral-500"><Elapsed date={order.createdAt} /><ServedOrderButton order={order} /><CancelOrderButton order={order} /></div></div><div className="space-y-3">{order.items.map(item => <div key={item.id} className="flex justify-between gap-4"><div><p className="font-medium">{item.quantity}× {item.productName} <span className="text-neutral-400">· {item.variantName}</span></p>{item.addons.map(a => <p key={a.id} className="text-sm text-neutral-500">+ {a.name}</p>)}{item.note && <p className="mt-1 text-sm font-medium text-amber-700">Obs: {item.note}</p>}</div><strong className="whitespace-nowrap">{money(item.quantity * (item.unitPrice + item.addons.reduce((a, b) => a + b.price, 0)))}</strong></div>)}</div></div>)}{!orders.length && <div className="empty-state"><ReceiptText size={28} /><p>Esta conta está livre.</p><button onClick={() => setAdding(true)} className="secondary-button">Abrir com um pedido</button></div>}</div>{orders.length > 0 && <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 p-5 sm:p-6"><span className="text-sm font-medium text-neutral-500">Saldo da comanda</span><strong className="text-2xl tracking-tight">{money(total)}</strong><button onClick={() => setCheckout(true)} className="primary-button">Fechar conta <CreditCard size={17} /></button></div>}</section></div></main>;
}

function MenuBuilder({ tableId, source, publicMenu = false, deliveryLink = false, onBack, onSent }: { tableId?: string; source: "waiter" | "qr"; publicMenu?: boolean; deliveryLink?: boolean; onBack?: () => void; onSent?: (number: number) => void }) {
  const { state, branding, createOrder, createPublicOrder } = useRestaurant(); const [category, setCategory] = useState("Todos"); const [search, setSearch] = useState(""); const [selected, setSelected] = useState<Product | null>(null); const [cart, setCart] = useState<CartItem[]>([]); const [cartOpen, setCartOpen] = useState(false); const [checkoutOpen, setCheckoutOpen] = useState(false); const [success, setSuccess] = useState<number | null>(null);
  const categories = ["Todos", ...new Set(state.products.map(product => product.category))];
  const filtered = state.products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const total = cart.reduce((sum, item) => { const p = state.products.find(x => x.id === item.productId)!; const variant = p.variants.find(v => v.id === item.variantId)!; return sum + item.quantity * (variant.price + p.addons.filter(a => item.addonIds.includes(a.id)).reduce((a, b) => a + b.price, 0)); }, 0);
  const confirmPublic = async (value: CustomerCheckoutValue) => {
    const result = await createPublicOrder({
      source: tableId ? "qr_menu" : "public_menu", fulfillment: value.fulfillment,
      tableNumber: tableId ? Number(tableId) : undefined,
      customer: { name: value.name, phone: value.phone }, items: cart,
      delivery: value.fulfillment === "delivery" ? { addressLine1: value.addressLine1!, neighborhood: value.neighborhood, reference: value.reference, latitude: value.latitude, longitude: value.longitude } : undefined,
    });
    if (!result.ok) { toast.error(result.message); return false; }
    setCart([]); setCartOpen(false); setSuccess(result.number); return true;
  };
  const submitting = useRef(false);
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (publicMenu) {
      setCartOpen(false); setCheckoutOpen(true); return;
    }
    if (!tableId || submitting.current) return; submitting.current=true; setSending(true); const result = await createOrder(tableId, cart, source).finally(()=>{submitting.current=false; setSending(false);}); if (!result.ok) { toast.error(result.message); return; } setCart([]); setCartOpen(false); setSuccess(result.number); onSent?.(result.number);
  };
  if (success) return <main className="customer-page"><div className="success-card"><span className="success-icon"><Check size={30} /></span><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Pedido enviado</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Pedido #{success}</h1><p className="mt-3 text-neutral-500">{publicMenu ? "Recebemos sua solicitação. A equipe vai conferir e aprovar antes de enviar para a cozinha." : "Pedido aprovado e enviado para a cozinha."}</p><Link href={tableId ? `/menu/mesa/${tableId}` : deliveryLink ? "/menu/entrega" : "/menu"} className="primary-button mt-7">Voltar ao cardápio</Link></div></main>;
  return <main className={publicMenu ? "customer-page" : "app-page"}><div className={publicMenu ? "customer-shell" : "page-container"}>
    {publicMenu ? <CustomerHeader tableId={tableId} deliveryLink={deliveryLink} /> : <Topbar title="Novo pedido" subtitle={`Mesa / comanda ${tableId}`} back="#" action={<button onClick={onBack} className="text-button">Cancelar</button>} />}
    {publicMenu && <div className="menu-hero"><Image src={branding.coverUrl || "/menu-hero.png"} fill sizes="(max-width: 768px) 100vw, 720px" alt={branding.coverUrl ? `Foto de capa de ${state.settings.name}` : "Pizza de calabresa artesanal"} className="object-cover" priority unoptimized={Boolean(branding.coverUrl)} /><div className="menu-hero-overlay"><span className="live-pill"><Sparkles size={13} /> Feito na hora</span><h1>Seu pedido,<br />do seu jeito.</h1></div></div>}
    <div className="menu-toolbar"><div className="search-box"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no cardápio" aria-label="Buscar produtos" /></div><div className="category-scroll">{categories.map(c => <button key={c} onClick={() => setCategory(c)} className={category === c ? "category-chip active" : "category-chip"}>{c}</button>)}</div></div>
    <section className="product-grid">{filtered.map(product => { const unavailable = !product.available || !isProductStockAvailable(state, product); return <button key={product.id} onClick={() => !unavailable && setSelected(product)} disabled={unavailable} className="product-card text-left">
      {product.imageUrl ? <div className="customer-product-photo"><Image src={product.imageUrl} alt={product.name} fill sizes="(max-width: 720px) 100vw, 320px" unoptimized /></div> : <div className="flex items-start justify-between gap-3"><div className="product-symbol">{product.category === "Pizzas" ? "🍕" : product.category === "Bebidas" ? "🥤" : product.category === "Açaí" ? "🫐" : product.category === "Sorvetes" ? "🍨" : product.category === "Pastéis" ? "🥟" : "🍽️"}</div></div>}
      <div className="flex items-start justify-between gap-2">{unavailable && <span className="sold-out">Indisponível</span>}</div><h3>{product.name}</h3><p>{product.description}</p><strong>A partir de {money(Math.min(...product.variants.map(v => v.price)))}</strong>
    </button>; })}</section>
    {cart.length > 0 && <button onClick={() => setCartOpen(true)} className="cart-dock"><span className="cart-count">{cart.reduce((s, i) => s + i.quantity, 0)}</span><span>Ver pedido</span><strong>{money(total)}</strong></button>}
    <ProductDialog product={selected} open={!!selected} onOpenChange={open => !open && setSelected(null)} onAdd={item => { setCart(c => [...c, item]); setSelected(null); toast.success("Item adicionado"); }} />
    <CartSheet open={cartOpen} onOpenChange={setCartOpen} cart={cart} setCart={setCart} state={state} total={total} submit={submit} sending={sending} whatsapp={false} submitLabel={publicMenu?"Continuar pedido":"Enviar para cozinha"} />
    {publicMenu && <CustomerCheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} tableId={tableId} deliveryOnly={deliveryLink} total={total} onConfirm={confirmPublic} />}
  </div></main>;
}

function CustomerHeader({ tableId, deliveryLink }: { tableId?: string; deliveryLink?: boolean }) { return <header className="customer-header"><Brand subtitle="Cardápio" /><div className="text-right"><p className="text-xs uppercase tracking-wider text-neutral-400">{tableId ? "Você está na" : deliveryLink ? "Cardápio para entrega" : "Cardápio online"}</p><strong>{tableId ? `Mesa / comanda ${tableId}` : deliveryLink ? "Receba em casa" : "Peça online"}</strong></div></header>; }

function isProductStockAvailable(state: RestaurantState, product: Product) { return product.variants.some(variant => variant.stockAvailable !== false && (product.recipe[variant.id] ?? []).every(component => (state.stock.find(s => s.id === component.stockId)?.quantity ?? 0) >= component.quantity)); }

function ProductDialog({ product, open, onOpenChange, onAdd }: { product: Product | null; open: boolean; onOpenChange: (open: boolean) => void; onAdd: (item: CartItem) => void }) {
  const [variantId, setVariantId] = useState(""); const [addonIds, setAddonIds] = useState<string[]>([]); const [note, setNote] = useState(""); const [qty, setQty] = useState(1);
  // Resetting the form here is intentional: each newly selected product starts clean.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (product) { setVariantId(product.variants[0]?.id ?? ""); setAddonIds([]); setNote(""); setQty(1); } }, [product]); if (!product) return null;
  const variant = product.variants.find(v => v.id === variantId) ?? product.variants[0]; const price = qty * (variant.price + product.addons.filter(a => addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-0 p-0 sm:max-w-xl"><DialogHeader className="border-b border-neutral-100 p-6 pr-12"><DialogTitle className="text-2xl">{product.name}</DialogTitle><DialogDescription className="text-base">{product.description}</DialogDescription></DialogHeader><div className="space-y-6 p-6"><div><label className="field-label">Escolha o tamanho</label><div className="grid gap-2 sm:grid-cols-3">{product.variants.map(v => <button key={v.id} disabled={v.stockAvailable === false} onClick={() => setVariantId(v.id)} className={variantId === v.id ? "choice-card selected" : "choice-card"}><span>{v.name}{v.stockAvailable === false ? " · indisponível" : ""}</span><strong>{money(v.price)}</strong></button>)}</div></div>{product.addons.length > 0 && <div><label className="field-label">Adicionais</label><div className="space-y-2">{product.addons.map(a => <label key={a.id} className="addon-row"><input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => setAddonIds(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids, a.id])} /><span>{a.name}</span><strong>+ {money(a.price)}</strong></label>)}</div></div>}<div><label className="field-label" htmlFor="note">Observação</label><textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: sem cebola" className="text-area" /></div><div className="flex items-center justify-between"><div className="quantity"><button aria-label="Diminuir quantidade" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={17} /></button><strong>{qty}</strong><button aria-label="Aumentar quantidade" onClick={() => setQty(q => q + 1)}><Plus size={17} /></button></div><button disabled={variant.stockAvailable === false} onClick={() => onAdd({ key: crypto.randomUUID(), productId: product.id, variantId: variantId || variant.id, addonIds, note, quantity: qty })} className="primary-button">Adicionar · {money(price)}</button></div></div></DialogContent></Dialog>;
}

function CartSheet({ open, onOpenChange, cart, setCart, state, total, submit, sending = false, whatsapp, submitLabel }: { open: boolean; onOpenChange: (open: boolean) => void; cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>>; state: RestaurantState; total: number; submit: () => void; sending?: boolean; whatsapp?: boolean; submitLabel?: string }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full sm:max-w-md"><SheetHeader className="border-b border-neutral-100 p-6"><SheetTitle className="text-xl">Seu pedido</SheetTitle><SheetDescription>{cart.reduce((s, i) => s + i.quantity, 0)} itens adicionados</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-6"><div className="space-y-5">{cart.map(item => { const p = state.products.find(x => x.id === item.productId)!; const v = p.variants.find(x => x.id === item.variantId)!; return <div key={item.key} className="cart-row"><div><p className="font-semibold">{item.quantity}× {p.name}</p><p className="text-sm text-neutral-500">{v.name}</p>{p.addons.filter(a => item.addonIds.includes(a.id)).map(a => <p key={a.id} className="text-sm text-neutral-500">+ {a.name}</p>)}{item.note && <p className="mt-1 text-sm text-amber-700">{item.note}</p>}</div><div className="text-right"><strong>{money(item.quantity * (v.price + p.addons.filter(a => item.addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0)))}</strong><button onClick={() => setCart(c => c.filter(x => x.key !== item.key))} className="mt-2 block w-full text-right text-xs text-red-600">Remover</button></div></div>; })}</div></div><div className="border-t border-neutral-200 p-6"><div className="mb-5 flex items-center justify-between"><span className="text-neutral-500">Total</span><strong className="text-2xl">{money(total)}</strong></div><button onClick={submit} disabled={sending || !cart.length} aria-busy={sending} className="primary-button w-full justify-center">{sending ? "Enviando pedido…" : whatsapp ? <><ShoppingBag size={18} /> Pedir pelo WhatsApp</> : <><CookingPot size={18} /> {submitLabel||"Enviar pedido"}</>}</button>{whatsapp && <p className="mt-3 text-center text-xs text-neutral-400">O pedido só será confirmado após o envio no WhatsApp.</p>}</div></SheetContent></Sheet>;
}

function CashierMenuShare() {
  const { state } = useRestaurant();
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/menu/entrega`;
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Peça sua entrega no cardápio da ${state.settings.name}: ${url}`)}`, "_blank", "noopener,noreferrer");
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link para entrega copiado."); } catch { toast.error("Não foi possível copiar o link."); } };
  return <section className="cash-share"><div><strong>Cardápio para entrega</strong><p>Envie pelo WhatsApp. O cliente informa nome e endereço; o pedido entra no sistema como entrega.</p></div><div><button className="secondary-button" onClick={() => void copy()}><Copy size={16} /> Copiar link</button><button className="primary-button" onClick={share}><ArrowRight size={16} /> Enviar no WhatsApp</button></div></section>;
}

function Cashier() {
  const { state } = useRestaurant(); const [selectedId, setSelectedId] = useState<string | null>(null); const table = state.tables.find(t => t.id === selectedId);
  if (table) return <AccountCheckout tableId={table.id} onBack={() => setSelectedId(null)} />;
  const open = state.tables.filter(t => t.status !== "available");
  return <main className="app-page"><div className="page-container"><Topbar title="Caixa" subtitle="Mesas e comandas abertas" action={<Link href="/operacao/garcom" className="primary-button">Novo pedido</Link>} /><CashShiftPanel /><Link className="secondary-button mb-4" href="/operacao/fiscal">Fiscal e contador</Link><PendingOrders /><CashierMenuShare /><div className="metric-grid compact"><Metric label="Mesas abertas" value={String(open.length)} icon={Table2} /><Metric label="Aguardando conta" value={String(state.tables.filter(t => t.status === "closing").length)} icon={ReceiptText} /><Metric label="Em aberto" value={money(open.reduce((s, t) => s + tableTotal(state, t.id), 0))} icon={WalletCards} /></div><h2 className="section-title mb-4">Contas abertas</h2><div className="cash-grid">{open.map(t => { const orders = state.orders.filter(o => o.tableId === t.id && !["completed", "cancelled"].includes(o.status)); return <button key={t.id} onClick={() => setSelectedId(t.id)} className="cash-card"><div className="flex items-start justify-between"><div><p className="text-sm text-neutral-500">Mesa</p><h3>{t.id}</h3></div><StatusPill status={t.status} /></div><div className="mt-8 flex items-end justify-between"><div><strong>{money(tableTotal(state, t.id))}</strong><p>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p></div><span className="open-account">Abrir conta <ChevronRight size={16} /></span></div></button>; })}</div><CashierOnlineOrders /></div></main>;
}

function Deliveries() {
  const { state, updateDeliveryStatus } = useRestaurant();
  const orders = state.orders.filter(order => order.fulfillment === "delivery" && (["confirmed", "preparing", "ready", "out_for_delivery"].includes(order.status) || (order.status === "delivered" && !order.paid))).sort((a, b) => a.number - b.number);
  const update = (order: Order, status: "out_for_delivery" | "delivered") => { void updateDeliveryStatus(order.id, status).then(result => result.ok ? toast.success(status === "out_for_delivery" ? "Pedido saiu para entrega." : "Entrega concluída.") : toast.error(result.message)); };
  return <main className="app-page"><div className="page-container max-w-5xl"><Topbar title="Entregas" subtitle={`${orders.length} pedido(s) em preparo, prontos ou em rota`} /><div className="mb-6 grid gap-3 sm:grid-cols-3"><div className="metric-card"><div className="metric-icon"><ChefHat size={18} /></div><p>Em preparo</p><strong>{orders.filter(order => ["confirmed", "preparing"].includes(order.status)).length}</strong></div><div className="metric-card"><div className="metric-icon"><Bike size={18} /></div><p>Prontos para sair</p><strong>{orders.filter(order => order.status === "ready").length}</strong></div><div className="metric-card"><div className="metric-icon"><MapPin size={18} /></div><p>Em rota</p><strong>{orders.filter(order => order.status === "out_for_delivery").length}</strong></div></div><section className="grid gap-4 md:grid-cols-2">{orders.map(order => <article key={order.id} className="command-card p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Pedido #{order.number}</span><span className="fulfillment-tag fulfillment-delivery">Entrega</span></div><h2 className="mt-2 text-xl font-semibold">{order.customerName || "Cliente"}</h2><p className="mt-1 text-xs text-neutral-500">{order.status === "confirmed" ? "Na fila da cozinha" : order.status === "preparing" ? "Em preparo" : order.status === "ready" ? "Pronto para sair" : order.status === "out_for_delivery" ? "Em rota" : "Entregue"}</p></div><span className={order.paid ? "order-pill order-completed" : "order-pill order-pending"}>{order.paid ? "Pago" : "Receber"}</span></div><div className="delivery-items">{order.items.map(item => <p key={item.id}>{item.quantity}× {item.productName} <span>· {item.variantName}</span></p>)}</div><div className="mt-5 flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-neutral-400" /><div className="text-sm"><p className="font-medium">{order.delivery?.addressLine1 || "Endereço não informado"}</p>{order.delivery?.neighborhood && <p className="mt-1 text-neutral-500">{order.delivery.neighborhood}</p>}{order.delivery?.reference && <p className="mt-1 text-neutral-500">Ref.: {order.delivery.reference}</p>}</div></div>{order.status === "ready" && <button onClick={() => update(order, "out_for_delivery")} className="primary-button mt-6 w-full justify-center"><Bike size={17} /> Saiu para entrega</button>}{order.status === "out_for_delivery" && <button onClick={() => update(order, "delivered")} className="primary-button mt-6 w-full justify-center"><Check size={17} /> Marcar entregue</button>}{!order.paid && <div className="mt-3"><ExternalPaymentAction order={order} /></div>}</article>)}{!orders.length && <div className="empty-state md:col-span-2"><Bike size={28} /><p>Nenhuma entrega aguardando agora.</p></div>}</section></div></main>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon: React.ComponentType<{ size?: number }>; }) { return <article className="metric-card"><div className="metric-icon"><Icon size={18} /></div><p>{label}</p><strong>{value}</strong>{note && <span>{note}</span>}</article>; }

const managementNav = [
  ["dashboard", "Dashboard", LayoutDashboard], ["mesas", "Mesas", Table2], ["pedidos", "Pedidos", ReceiptText], ["cardapio", "Cardápio", MenuIcon], ["estoque", "Estoque", Boxes], ["custos", "Custos", TrendingUp], ["caixa", "Caixa", CircleDollarSign], ["financeiro", "Financeiro", WalletCards], ["fiscal", "Fiscal", ReceiptText], ["equipe", "Equipe", UsersRound], ["relatorios", "Relatórios", FileBarChart], ["configuracoes", "Configurações", Settings],
] as const;

function Management({ section }: { section: string }) {
  const router = useRouter(); const [mobileNav, setMobileNav] = useState(false); const pageRef = useRef<HTMLDivElement>(null); const { logout, session, plan } = useRestaurant();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = pageRef.current?.animate(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    return () => animation?.cancel();
  }, [section]);
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = `/gestao/${id}`;
    if (window.location.pathname !== destination) window.history.pushState(null, "", destination);
    setMobileNav(false);
  };
  const signOut = () => { void logout().then(() => router.push("/gestao")); };
  return <main className="management"><aside className={mobileNav ? "manage-sidebar open" : "manage-sidebar"}><div className="p-6"><Brand dark /></div><nav aria-label="Áreas da gestão">{managementNav.filter(([id])=>plan==='professional'||!['financeiro','custos','fiscal'].includes(id)).map(([id, label, Icon]) => <a key={id} href={`/gestao/${id}`} onClick={event => navigate(event, id)} aria-current={section === id ? "page" : undefined} className={section === id ? "active" : ""}><Icon size={18} /><span>{label}</span></a>)}</nav><button onClick={signOut} className="logout-button"><LogOut size={17} /> Trocar usuário</button></aside>{mobileNav && <button className="sidebar-overlay" onClick={() => setMobileNav(false)} aria-label="Fechar menu" />}<div className="manage-content"><header className="manage-top"><button onClick={() => setMobileNav(true)} className="icon-button lg:hidden" aria-label="Abrir menu"><MenuIcon size={19} /></button><div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Gestão</p><h1 key={section} className="manage-title text-xl font-semibold capitalize">{managementNav.find(([id]) => id === section)?.[1] ?? section}</h1></div><div className="flex items-center gap-3"><span className="sync-dot" /><span className="hidden text-sm text-neutral-500 sm:block">{session?.username ?? "Gestão"}</span><div className="avatar">{(session?.username ?? "AD").slice(0, 2).toUpperCase()}</div></div></header><div className="manage-page" ref={pageRef}><ManagementSection section={section} /></div></div></main>;
}


function ManagementSection({ section }: { section: string }) {
  const {plan}=useRestaurant();
  if(plan==='essential' && ['financeiro','custos','fiscal'].includes(section))return <p>Este recurso está disponível no plano Profissional.</p>;
  if(plan==='essential' && section==='dashboard')return <Dashboard />;
  if(plan==='essential' && section==='relatorios')return <Reports />;
  if(plan==='essential' && section==='caixa')return <CashShiftPanel />;
  if (section === "fiscal") return <FiscalWorkspace />; if (section === "dashboard") return <FinanceWorkspace key="dashboard" />; if(section === "financeiro") return <FinanceWorkspace />; if (section === "mesas") return <ManagementTables />; if (section === "pedidos") return <ManageOrders />; if (section === "cardapio") return <ManagementMenu />; if (section === "estoque") return <Stock />; if(section === "custos")return <CostManagement />; if (section === "caixa") return <FinanceWorkspace key="cash" initialTab="cash" />; if (section === "equipe") return <><PageTitle title="Equipe" subtitle="Cadastre cada pessoa com nome, papel e PIN para iniciar o turno." /><TeamManagement /></>; if (section === "relatorios") return <FinanceWorkspace key="results" initialTab="results" />; if (section === "configuracoes") return <ManagementSettings />; return <NotFound />;
}

function Dashboard() { const { state } = useRestaurant(); const completed = state.sales; const revenue = completed.reduce((sum, sale) => sum + sale.subtotal, 0); const active = state.orders.filter(order => !["completed", "cancelled"].includes(order.status)); const ticket = completed.length ? revenue / completed.length : 0; return <><div className="page-heading"><div><h2>Visão geral</h2><p>Dados reais desta operação</p></div></div><div className="metric-grid"><Metric label="Faturamento" value={money(revenue)} note="Pedidos concluídos" icon={TrendingUp} /><Metric label="Pedidos em andamento" value={String(active.length)} note="Fila atual" icon={ReceiptText} /><Metric label="Mesas abertas" value={String(state.tables.filter(table => table.status !== "available").length)} icon={Table2} /><Metric label="Ticket médio" value={money(ticket)} icon={CreditCard} /></div><section className="chart-card mt-6"><div className="card-heading"><div><h3>Pedidos recentes</h3><p>Atualizado automaticamente</p></div></div>{state.orders.length ? <div className="rank-list">{state.orders.slice(0, 8).map(order => <div key={order.id}><span className="rank">#{order.number}</span><strong>{order.tableId.startsWith("externo-") ? "Pedido online" : `Mesa ${order.tableId}`}</strong><div><i style={{ width: "100%" }} /></div><b>{money(orderTotal(order))}</b></div>)}</div> : <div className="empty-state"><ReceiptText size={28} /><p>Nenhum pedido registrado ainda.</p></div>}</section></>; }



function ManageOrders() {
  const { state } = useRestaurant();
  const [filter, setFilter] = useState<"active" | "completed" | "cancelled">("active");
  const [search, setSearch] = useState("");
  const orders = [...state.orders].filter(order => filter === "active" ? !["completed", "cancelled"].includes(order.status) : order.status === filter).filter(order => `${order.number} ${order.tableId} ${order.customerName || ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return <><PendingOrders /><PageTitle title="Pedidos" subtitle="Acompanhe a fila e consulte o histórico sem rolar tabelas no celular." /><div className="orders-toolbar"><div className="orders-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Em andamento <span>{state.orders.filter(o => !["completed", "cancelled"].includes(o.status)).length}</span></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>Concluídos</button><button className={filter === "cancelled" ? "active" : ""} onClick={() => setFilter("cancelled")}>Cancelados</button></div><label className="admin-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pedido ou cliente" /></label></div><div className="orders-card-grid">{orders.map(order => <article key={order.id} className="orders-admin-card"><div className="flex items-start justify-between gap-3"><div><span className="text-xs text-neutral-500">{new Date(order.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span><h3>Pedido #{order.number}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><span className={`fulfillment-tag fulfillment-${order.fulfillment}`}>{order.fulfillment === "delivery" ? "Entrega" : order.fulfillment === "pickup" ? "Retirada" : "Mesa"}</span><span className="text-sm text-neutral-500">{order.fulfillment === "dine_in" ? `Mesa ${order.tableId}` : order.customerName || "Cliente"}</span></div></div><OrderPill status={order.status} /></div><div className="orders-admin-items">{order.items.map(item => <p key={item.id}>{item.quantity}× {item.productName} <span>· {item.variantName}</span></p>)}</div><div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3"><strong>{money(state.sales.find(sale => sale.orderIds.includes(order.id))?.total ?? orderTotal(order))}</strong><RefundOrderButton order={order} />{!["completed", "cancelled"].includes(order.status) && <CancelOrderButton order={order} />}</div></article>)}</div>{!orders.length && <div className="empty-state"><ReceiptText size={28} /><p>{filter === "active" ? "Nenhum pedido em andamento." : "Nenhum pedido nesta categoria."}</p></div>}</>;
}

function Stock() { return <InventoryManagement />; }

function Reports() { const { state } = useRestaurant(); const completed = state.sales; const total = completed.reduce((sum, sale) => sum + sale.subtotal, 0); return <><PageTitle title="Relatórios" subtitle="Resumo calculado somente com pedidos reais." /><div className="metric-grid"><Metric label="Faturamento" value={money(total)} icon={TrendingUp} /><Metric label="Pedidos concluídos" value={String(completed.length)} icon={ReceiptText} /><Metric label="Ticket médio" value={money(completed.length ? total / completed.length : 0)} icon={CreditCard} /><Metric label="Mesas cadastradas" value={String(state.tables.length)} icon={Table2} /></div></>; }



function PageTitle({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && onAction && <button onClick={onAction} className="primary-button"><Plus size={17} /> {action}</button>}</div>; }
function NotFound() { return <main className="app-page grid min-h-screen place-items-center"><div className="text-center"><p className="text-sm font-semibold uppercase tracking-wider text-neutral-400">404</p><h1 className="mt-2 text-3xl font-semibold">Página não encontrada</h1><Link href="/operacao" className="primary-button mt-6">Voltar à operação</Link></div></main>; }

function destinationForRole(role: StaffRole) {
  if (role === "waiter") return "/operacao/garcom";
  if (role === "kitchen") return "/operacao/cozinha";
  if (role === "cashier") return "/operacao/caixa";
  if (role === "delivery") return "/operacao/entregas";
  return "/gestao/dashboard";
}

function StaffGate({ children, roles }: { children: React.ReactNode; roles?: StaffRole[] }) {
  const router = useRouter(); const { authenticated, ready, session, logout } = useRestaurant();
  if (!ready) return <main className="app-page min-h-screen" aria-busy="true" />;
  if (authenticated && session && (!roles || session.role === "admin" || roles.includes(session.role))) return <>{children}</>;
  if (authenticated && session) return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Área não liberada</h2><p className="mt-2">{session.username} está em {session.role === "waiter" ? "Garçom" : session.role === "kitchen" ? "Cozinha" : session.role === "cashier" ? "Caixa" : session.role === "delivery" ? "Entrega" : "Gestão"}. Escolha a área correta ou troque o usuário.</p><Link href={destinationForRole(session.role)} className="primary-button mt-6 justify-center">Ir para minha área <ArrowRight size={18} /></Link><button onClick={() => { void logout().then(() => router.push("/gestao")); }} className="secondary-button mt-3">Trocar usuário</button></div></section></main>;
  return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Confirme seu acesso</h2><p className="mt-2">Você selecionou esta área. Entre para continuar no papel escolhido.</p><Link href="/gestao" onClick={() => sessionStorage.setItem("restaurante-return-to", window.location.pathname)} className="primary-button mt-6 justify-center">Entrar <ArrowRight size={18} /></Link></div></section></main>;
}

function ServerLogin() {
  const router = useRouter();
  const { login } = useRestaurant();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/auth/team", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(body => setTeam((body as { team?: Array<{ id: string; name: string; role: string }> } | null)?.team ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (sessionStorage.getItem("restaurante-return-to")?.startsWith("/operacao")) requestAnimationFrame(() => setMode("staff")); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    const result = await login(user, password);
    setBusy(false);
    if (!result.ok) { toast.error(result.message); return; }
    const requested = sessionStorage.getItem("restaurante-return-to");
    const destination = requested || destinationForRole(result.role ?? "admin");
    sessionStorage.removeItem("restaurante-return-to");
    router.push(destination);
  };
  const owner = mode === "owner";
  return <main className="login-page"><section className="login-brand"><Brand dark /><div><span className="live-pill"><Sparkles size={13} /> Operação conectada</span><h1>Uma fila.<br />Uma operação.</h1><p>Pedidos, cozinha e caixa trabalham sobre a mesma base em tempo real.</p></div></section><section className="login-form-wrap"><form onSubmit={submit} className="login-card"><div className="login-lock"><LockKeyhole size={22} /></div><h2>{owner ? "Entrar na Gestão" : "Iniciar turno"}</h2><p>{owner ? "Acesse como responsável para configurar o restaurante e a equipe." : "Escolha seu nome e informe o PIN. O acesso fica aberto até trocar o usuário."}</p><div className="mb-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("owner")} className={owner ? "category-chip active" : "category-chip"}>Responsável</button><button type="button" onClick={() => setMode("staff")} className={!owner ? "category-chip active" : "category-chip"}>Equipe</button></div>{!owner && team.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{team.map(member => <button type="button" key={member.id} onClick={() => setUser(member.name)} className={user === member.name ? "category-chip active" : "category-chip"}>{member.name}</button>)}</div>}<label><span>{owner ? "Usuário administrador" : "Nome"}</span><input value={user} onChange={event => setUser(event.target.value)} autoComplete="username" placeholder={owner ? "Seu usuário" : "Seu nome"} required /></label><label><span>{owner ? "Senha" : "PIN"}</span><input value={password} onChange={event => setPassword(owner ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode={owner ? "text" : "numeric"} type="password" autoComplete="current-password" placeholder={owner ? "Sua senha" : "4 a 6 números"} required /></label><button className="primary-button w-full justify-center" type="submit" disabled={busy}>{busy ? "Entrando…" : owner ? "Entrar na gestão" : "Entrar no turno"} <ArrowRight size={18} /></button><p className="mt-4 text-center text-xs text-neutral-400">{owner ? "Use o usuário e a senha administrativos configurados no deploy." : "O PIN é criado pelo responsável ao cadastrar cada pessoa da equipe."}</p></form></section></main>;
}

function AppRouter() {
  const pathname = usePathname(); const { createOrder } = useRestaurant();
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "create_table_order",
      title: "Criar pedido de mesa",
      description: "Confirma um pedido real para uma mesa e envia à cozinha, usando IDs de produto e variante do cardápio.",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" }, variantId: { type: "string" }, quantity: { type: "number", minimum: 1 } },
              required: ["productId", "variantId", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: ["tableId", "items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { tableId: string; items: { productId: string; variantId: string; quantity: number }[] };
        if (!value?.tableId || !Array.isArray(value.items) || !value.items.length) throw new Error("Mesa e itens são obrigatórios");
        const result = await createOrder(value.tableId, value.items.map((i, index) => ({ ...i, key: `tool-${index}`, addonIds: [] })), "waiter");
        if (!result.ok) throw new Error(result.message);
        return { orderNumber: result.number, status: "confirmed", tableId: value.tableId };
      },
    };
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* unsupported context */ }
    return () => lifecycle.abort();
  }, [createOrder]);
  if (pathname === "/operacao") return <StaffGate><OperationHome /></StaffGate>;
  if (pathname === "/operacao/garcom") return <StaffGate roles={["waiter", "cashier", "manager"]}><WaiterTables /></StaffGate>;
  if (pathname.startsWith("/operacao/garcom/mesa/")) return <StaffGate roles={["waiter", "cashier", "manager"]}><TableCommand tableId={String(Number(pathname.split("/").pop())).padStart(2, "0")} /></StaffGate>;
  if (pathname === "/operacao/cozinha") return <StaffGate roles={["kitchen", "manager"]}><KitchenBoard /></StaffGate>;
  if (pathname === "/operacao/fiscal") return <StaffGate roles={["cashier", "manager"]}><main className="app-page"><div className="page-container"><Topbar title="Fiscal" back="/operacao/caixa" /><FiscalWorkspace /></div></main></StaffGate>;
  if (pathname === "/operacao/caixa") return <StaffGate roles={["cashier", "manager"]}><Cashier /></StaffGate>;
  if (pathname === "/operacao/entregas") return <StaffGate roles={["delivery", "cashier", "manager"]}><Deliveries /></StaffGate>;
  if (pathname === "/menu") return <MenuBuilder source="qr" publicMenu />;
  if (pathname === "/menu/entrega") return <MenuBuilder key="delivery-menu" source="qr" publicMenu deliveryLink />;
  if (pathname.startsWith("/menu/mesa/")) return <MenuBuilder source="qr" publicMenu tableId={pathname.split("/").pop()!} />;
  if (pathname === "/gestao") return <ServerLogin />;
  if (pathname.startsWith("/gestao/")) return <StaffGate roles={["manager"]}><Management section={pathname.split("/").pop() || "dashboard"} /></StaffGate>;
  return <NotFound />;
}

export default function RestaurantApp() {
  const [mounted, setMounted] = useState(false);
  // The local demo store is browser-only; wait for hydration before rendering it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="app-page min-h-screen" aria-busy="true" />;
  return <RestaurantStoreProvider><AppRouter /><Toaster position="top-center" richColors /></RestaurantStoreProvider>;
}
