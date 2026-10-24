"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Copy, ReceiptText, Table2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Topbar, StatusPill, Metric } from "@/components/shared/blocos";
import { CashShiftPanel } from "@/components/finance-workspace";
import { PendingOrders } from "@/components/pending-orders";
import { AccountCheckout } from "@/components/account-checkout";
import { CashierOnlineOrders } from "@/components/external-payment";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal } from "@/lib/domain";

function CashierMenuShare() {
  const { state } = useRestaurant();
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/menu/entrega`;
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Peça sua entrega no cardápio da ${state.settings.name}: ${url}`)}`, "_blank", "noopener,noreferrer");
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link para entrega copiado."); } catch { toast.error("Não foi possível copiar o link."); } };
  return <section className="cash-share"><div><strong>Cardápio para entrega</strong><p>Envie pelo WhatsApp. O cliente informa nome e endereço; o pedido entra no sistema como entrega.</p></div><div><button className="secondary-button" onClick={() => void copy()}><Copy size={16} /> Copiar link</button><button className="primary-button" onClick={share}><ArrowRight size={16} /> Enviar no WhatsApp</button></div></section>;
}

export function Cashier() {
  const { state } = useRestaurant(); const [selectedId, setSelectedId] = useState<string | null>(null); const table = state.tables.find(t => t.id === selectedId);
  if (table) return <AccountCheckout tableId={table.id} onBack={() => setSelectedId(null)} />;
  const open = state.tables.filter(t => t.status !== "available");
  return <main className="app-page"><div className="page-container"><Topbar title="Caixa" subtitle="Mesas e comandas abertas" action={<Link href="/operacao/garcom" className="primary-button">Novo pedido</Link>} /><CashShiftPanel /><Link className="secondary-button mb-4" href="/operacao/fiscal">Fiscal e contador</Link><PendingOrders /><CashierMenuShare /><div className="metric-grid compact"><Metric label="Mesas abertas" value={String(open.length)} icon={Table2} /><Metric label="Aguardando conta" value={String(state.tables.filter(t => t.status === "closing").length)} icon={ReceiptText} /><Metric label="Em aberto" value={money(open.reduce((s, t) => s + tableTotal(state, t.id), 0))} icon={WalletCards} /></div><h2 className="section-title mb-4">Contas abertas</h2><div className="cash-grid">{open.map(t => { const orders = state.orders.filter(o => o.tableId === t.id && !["completed", "cancelled"].includes(o.status)); return <button key={t.id} onClick={() => setSelectedId(t.id)} className="cash-card"><div className="flex items-start justify-between"><div><p className="text-sm text-neutral-500">Mesa</p><h3>{t.id}</h3></div><StatusPill status={t.status} /></div><div className="mt-8 flex items-end justify-between"><div><strong>{money(tableTotal(state, t.id))}</strong><p>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p></div><span className="open-account">Abrir conta <ChevronRight size={16} /></span></div></button>; })}</div><CashierOnlineOrders /></div></main>;
}
