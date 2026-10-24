"use client";
import { MenuBuilder } from "@/components/cardapio/cardapio";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { Topbar, StatusPill, OrderPill, Elapsed, Brand, Metric, PageTitle, NotFound } from "@/components/shared/blocos";
import { AccessHub } from "./access-hub";
import { FiscalWorkspace } from "./fiscal-workspace";
import { FinanceWorkspace, CashShiftPanel } from "./finance-workspace";
import { ServedOrderButton } from "./served-order-button";
import { CostManagement } from "./cost-management";
import { RefundOrderButton } from "./refund-order-button";
import { PendingOrders } from "./pending-orders";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Bike, Boxes, Check, ChefHat, ChevronRight, CircleDollarSign,
  Copy, CreditCard, FileBarChart, LayoutDashboard, LockKeyhole, LogOut,
  MapPin, Menu as MenuIcon, Plus, ReceiptText, Search, Settings,
  X, Sparkles, Table2, TrendingUp, UtensilsCrossed, UsersRound, WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { RestaurantStoreProvider, type StaffRole, useRestaurant } from "@/lib/restaurant-store";
import { InventoryManagement } from "@/components/inventory-management";
import { TeamManagement } from "@/components/team-management";
import { ManagementMenu } from "@/components/management-menu";
import { ManagementTables } from "@/components/management-tables";
import { ManagementSettings } from "@/components/management-settings";
import { KitchenBoard } from "@/components/kitchen-board";
import { AccountCheckout } from "@/components/account-checkout";
import { CashierOnlineOrders, ExternalPaymentAction } from "@/components/external-payment";
import type { Order } from "@/lib/domain";
import { money, orderTotal, tableTotal } from "@/lib/domain";





function OperationHome() {
  const { session, logout, state, branding } = useRestaurant();
  const areas = [
    { href: "/operacao/garcom", role: "waiter", label: "Garçom", note: "Mesas e comandas", icon: UtensilsCrossed, tone: "lime" },
    { href: "/operacao/cozinha", role: "kitchen", label: "Cozinha", note: "Fila de produção", icon: ChefHat, tone: "amber" },
    { href: "/operacao/caixa", role: "cashier", label: "Caixa", note: "Contas e pagamentos", icon: CircleDollarSign, tone: "blue" },
    { href: "/operacao/entregas", role: "delivery", label: "Entregas", note: "Rotas e pedidos prontos", icon: Bike, tone: "amber" },
    { href: "/gestao/dashboard", role: "manager", label: "Gestão", note: "Indicadores e controle", icon: LayoutDashboard, tone: "violet" },
  ];
  const visibleAreas = session?.role === "admin" || session?.role === "manager" ? areas : areas.filter(area => area.role === session?.role);
  return <AccessHub name={state.settings.name} logoUrl={branding.logoUrl} areas={visibleAreas} username={session?.username} actions={session ? <button onClick={() => void logout()} className="secondary-button">Trocar usuário</button> : undefined} />;
}


function WaiterTables() {
  const { state } = useRestaurant();
  const summary = [
    ["Livres", state.tables.filter(t => t.status === "available").length], ["Em atendimento", state.tables.filter(t => ["occupied", "preparing"].includes(t.status)).length], ["Prontos", state.tables.filter(t => t.status === "ready").length], ["Fechamento", state.tables.filter(t => t.status === "closing").length],
  ];
  return <main className="app-page"><div className="page-container"><Topbar title="Salão" subtitle="Selecione o número para abrir a mesa ou comanda" action={<div className="hidden items-center gap-2 sm:flex"><span className="sync-dot" /> <span className="text-sm text-neutral-500">Ao vivo</span></div>} /><PendingOrders /><div className="summary-strip">{summary.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="mb-4 flex items-center justify-between"><h2 className="section-title">Mesas</h2><span className="text-sm text-neutral-500">{state.tables.filter(t => t.active).length} ativas</span></div><section className="table-grid">{state.tables.filter(t => t.active).map(table => { const orders = state.orders.filter(o => o.tableId === table.id && !["cancelled", "completed"].includes(o.status)); const total = tableTotal(state, table.id); return <Link key={table.id} href={`/operacao/garcom/mesa/${table.id}`} className={`table-card table-${table.status}`}><div className="flex items-start justify-between"><span className="table-number">{String(table.number).padStart(2, "0")}</span>{table.status === "ready" && <Bell size={18} className="text-emerald-600" />}</div><div className="mt-8"><StatusPill status={table.status} />{table.status !== "available" ? <><p className="mt-3 text-lg font-semibold">{money(total)}</p><p className="mt-1 text-xs text-neutral-500">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p></> : <p className="mt-3 text-sm text-neutral-400">Disponível para abrir</p>}</div></Link>; })}</section></div></main>;
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


const managementNav = [
  ["dashboard", "Dashboard", LayoutDashboard], ["mesas", "Mesas", Table2], ["pedidos", "Pedidos", ReceiptText], ["cardapio", "Cardápio", MenuIcon], ["estoque", "Estoque", Boxes], ["financeiro", "Financeiro", WalletCards], ["fiscal", "Fiscal", ReceiptText], ["equipe", "Equipe", UsersRound], ["relatorios", "Relatórios", FileBarChart], ["configuracoes", "Configurações", Settings],
] as const;

const subscribeCompactMenu = (notify: () => void) => {
  const media = window.matchMedia("(max-width: 1024px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
function Management({ section }: { section: string }) {
  const router = useRouter(); const [mobileNav, setMobileNav] = useState(false); const pageRef = useRef<HTMLDivElement>(null); const { logout, session, plan } = useRestaurant();
  const [collapsed, setCollapsed] = useState(false);
  const compact = useSyncExternalStore(subscribeCompactMenu, () => window.matchMedia("(max-width: 1024px)").matches, () => false);
  const navOpen = compact ? mobileNav : !collapsed;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeNav = () => { setMobileNav(false); setCollapsed(true); toggleRef.current?.focus(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { setMobileNav(false); setCollapsed(true); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const activeSection = section === "caixa" ? "financeiro" : section === "configuracoes-fiscal" ? "configuracoes" : section;
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
  return <main className={`management${navOpen ? " nav-open" : " nav-closed"}`}>
    <aside id="management-navigation" inert={!navOpen} className={`manage-sidebar${navOpen ? " open" : ""}${mobileNav ? " mobile-open" : ""}`}>
      <div className="sidebar-brand"><Brand dark /><button className="icon-button" onClick={closeNav} aria-label="Fechar menu lateral"><X size={19} /></button></div>
      <nav aria-label="Áreas da gestão">{managementNav.filter(([id]) => plan === 'professional' || id !== 'fiscal').map(([id, label, Icon]) => <a key={id} href={`/gestao/${id}`} onClick={event => navigate(event, id)} aria-current={activeSection === id ? "page" : undefined} className={activeSection === id ? "active" : ""}><Icon size={18} /><span>{label}</span></a>)}</nav>
      <button onClick={signOut} className="logout-button"><LogOut size={17} /> Trocar usuário</button>
    </aside>
    {compact && <button className={`sidebar-overlay${navOpen ? " open" : ""}`} onClick={closeNav} aria-label="Fechar menu" aria-hidden={!navOpen} tabIndex={-1} disabled={!navOpen} />}
    <div className="manage-content"><header className="manage-top">
      <button ref={toggleRef} onClick={() => compact ? setMobileNav(value => !value) : setCollapsed(value => !value)} className="icon-button" aria-label={navOpen ? "Recolher menu" : "Abrir menu"} aria-expanded={navOpen} aria-controls="management-navigation"><MenuIcon size={19} /></button>
      <div className="manage-heading"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Gestão</p><h1 key={section} className="manage-title text-xl font-semibold capitalize">{managementNav.find(([id]) => id === activeSection)?.[1] ?? section}</h1></div>
      <div className="flex items-center gap-3"><span className="hidden text-sm text-neutral-500 sm:block">{session?.username ?? "Gestão"}</span><div className="avatar">{(session?.username ?? "AD").slice(0, 2).toUpperCase()}</div></div>
    </header><div className="manage-page" ref={pageRef}><ManagementSection section={section} /></div></div>
  </main>;
}


function ManagementSection({ section }: { section: string }) {
  const {plan}=useRestaurant();
  if(plan==='essential' && ['custos','fiscal','configuracoes-fiscal'].includes(section))return <p>Este recurso está disponível no plano Profissional.</p>;
  if(plan==='essential' && section==='dashboard')return <Dashboard />;
  if(plan==='essential' && section==='relatorios')return <Reports />;
  if(plan==='essential' && ['caixa','financeiro'].includes(section))return <CashShiftPanel />;
  if (section === "configuracoes-fiscal") return <ManagementSettings key="fiscal" initialSection="fiscal" />; if (section === "fiscal") return <FiscalWorkspace />; if (section === "dashboard") return <FinanceWorkspace key="dashboard" />; if(section === "financeiro") return <FinanceWorkspace />; if (section === "mesas") return <ManagementTables />; if (section === "pedidos") return <ManageOrders />; if (section === "cardapio") return <ManagementMenu />; if (section === "estoque") return <Stock />; if(section === "custos")return <CostManagement />; if (section === "caixa") return <FinanceWorkspace key="cash" initialTab="cash" />; if (section === "equipe") return <><PageTitle title="Equipe" subtitle="Cadastre cada pessoa com nome, papel e PIN para iniciar o turno." /><TeamManagement /></>; if (section === "relatorios") return <FinanceWorkspace key="results" initialTab="results" />; if (section === "configuracoes") return <ManagementSettings />; return <NotFound />;
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




function destinationForRole(role: StaffRole) {
  if (role === "waiter") return "/operacao/garcom";
  if (role === "kitchen") return "/operacao/cozinha";
  if (role === "cashier") return "/operacao/caixa";
  if (role === "delivery") return "/operacao/entregas";
  return "/gestao/dashboard";
}

function LoginBackLink() {
  return <Link href="/" className="login-back" onClick={() => sessionStorage.removeItem("restaurante-return-to")}><ArrowLeft size={18} aria-hidden="true" />Voltar ao início</Link>;
}

function StaffGate({ children, roles }: { children: React.ReactNode; roles?: StaffRole[] }) {
  const router = useRouter(); const { authenticated, ready, session, logout } = useRestaurant();
  if (!ready) return <main className="app-page min-h-screen" aria-busy="true" />;
  if (authenticated && session && (!roles || session.role === "admin" || roles.includes(session.role))) return <>{children}</>;
  if (authenticated && session) return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Área não liberada</h2><p className="mt-2">{session.username} está em {session.role === "waiter" ? "Garçom" : session.role === "kitchen" ? "Cozinha" : session.role === "cashier" ? "Caixa" : session.role === "delivery" ? "Entrega" : "Gestão"}. Escolha a área correta ou troque o usuário.</p><Link href={destinationForRole(session.role)} className="primary-button mt-6 justify-center">Ir para minha área <ArrowRight size={18} /></Link><button onClick={() => { void logout().then(() => router.push("/gestao")); }} className="secondary-button mt-3">Trocar usuário</button></div></section></main>;
  return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Confirme seu acesso</h2><p className="mt-2">Você selecionou esta área. Entre para continuar no papel escolhido.</p><Link href="/gestao" onClick={() => sessionStorage.setItem("restaurante-return-to", window.location.pathname)} className="primary-button mt-6 justify-center">Entrar <ArrowRight size={18} /></Link></div></section></main>;
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
  return <main className="login-page"><section className="login-brand"><Brand dark /><div><span className="live-pill"><Sparkles size={13} /> Operação conectada</span><h1>Uma fila.<br />Uma operação.</h1><p>Pedidos, cozinha e caixa trabalham sobre a mesma base em tempo real.</p></div></section><section className="login-form-wrap"><form onSubmit={submit} className="login-card"><LoginBackLink /><div className="login-lock"><LockKeyhole size={22} /></div><h2>{owner ? "Entrar na Gestão" : "Iniciar turno"}</h2><p>{owner ? "Acesse como responsável para configurar o restaurante e a equipe." : "Escolha seu nome e informe o PIN. O acesso fica aberto até trocar o usuário."}</p><div className="mb-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("owner")} className={owner ? "category-chip active" : "category-chip"}>Responsável</button><button type="button" onClick={() => setMode("staff")} className={!owner ? "category-chip active" : "category-chip"}>Equipe</button></div>{!owner && team.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{team.map(member => <button type="button" key={member.id} onClick={() => setUser(member.name)} className={user === member.name ? "category-chip active" : "category-chip"}>{member.name}</button>)}</div>}<label><span>{owner ? "Usuário administrador" : "Nome"}</span><input value={user} onChange={event => setUser(event.target.value)} autoComplete="username" placeholder={owner ? "Seu usuário" : "Seu nome"} required /></label><label><span>{owner ? "Senha" : "PIN"}</span><input value={password} onChange={event => setPassword(owner ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode={owner ? "text" : "numeric"} type="password" autoComplete="current-password" placeholder={owner ? "Sua senha" : "4 a 6 números"} required /></label><button className="primary-button w-full justify-center" type="submit" disabled={busy}>{busy ? "Entrando…" : owner ? "Entrar na gestão" : "Entrar no turno"} <ArrowRight size={18} /></button><p className="mt-4 text-center text-xs text-neutral-400">{owner ? "Use o usuário e a senha administrativos configurados no deploy." : "O PIN é criado pelo responsável ao cadastrar cada pessoa da equipe."}</p></form></section></main>;
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
  if (pathname === "/gestao/configuracoes/fiscal") return <StaffGate roles={["manager"]}><Management section="configuracoes-fiscal" /></StaffGate>;
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
