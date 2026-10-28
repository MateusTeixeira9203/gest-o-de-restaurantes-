"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Copy, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/shared/blocos";
import { Carregando, Vazio } from "@/components/shared/estados";
import { SeloCanal, SeloEstado } from "@/components/shared/selos";
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
  return <section className="cash-share"><div><h2>Cardápio para entrega</h2><p>Envie pelo WhatsApp. O pedido do cliente chega para aprovação.</p></div><div><button className="secondary-button" onClick={() => void copy()}><Copy size={16} />Copiar link</button><button className="secondary-button" onClick={share}><ArrowRight size={16} />Enviar no WhatsApp</button></div></section>;
}

export function Cashier() {
  const { state, ready } = useRestaurant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const table = state.tables.find(t => t.id === selectedId);
  if (!ready) return <main className="app-page caixa-page"><div className="page-container"><Topbar title="Caixa" subtitle="Carregando contas" /><Carregando formato="lista" mensagem="Carregando contas abertas…" /></div></main>;
  if (table) return <AccountCheckout tableId={table.id} onBack={() => setSelectedId(null)} />;
  const open = state.tables.filter(t => t.status !== "available");
  return <main className="app-page caixa-page"><div className="page-container">
    <Topbar title="Caixa" subtitle="Contas abertas para conferir e receber" action={<Link href="/operacao/garcom?novo=1" className="secondary-button">Novo pedido</Link>} />
    <section aria-labelledby="caixa-open-title"><div className="caixa-section-heading"><div><h2 id="caixa-open-title" className="section-title">Contas abertas</h2><p className="caixa-context">{open.length} {open.length === 1 ? "conta" : "contas"} em atendimento</p></div><div className="caixa-open-total"><span className="caixa-context">Em aberto</span><strong>{money(open.reduce((s, t) => s + tableTotal(state, t.id), 0))}</strong></div></div>
      {open.length ? <div className="caixa-accounts">{open.map(t => {
        const orders = state.orders.filter(o => o.tableId === t.id && !["completed", "cancelled"].includes(o.status));
        const first = orders[0];
        return <button key={t.id} onClick={() => setSelectedId(t.id)} className="caixa-account"><span className="caixa-account-number">{t.id}</span><span className="caixa-account-info"><strong>{t.label || `Mesa ${t.id}`}</strong><span className="caixa-context">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}{t.openedAt && <> · Desde {new Date(t.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>}</span>{first && <SeloCanal pedido={{ fulfillment: first.fulfillment ?? "dine_in", orderNumber: first.number, tableNumber: t.number }} />}</span><span className="caixa-account-value"><strong>{money(tableTotal(state, t.id))}</strong><SeloEstado texto={t.status === "closing" ? "Pediu a conta" : "Em atendimento"} tom={t.status === "closing" ? "bill" : "info"} /><span className="caixa-context caixa-open-label">Conferir conta<ChevronRight size={16} /></span></span></button>;
      })}</div> : <Vazio icone={WalletCards} titulo="Nenhuma conta aberta agora" descricao="As mesas e comandas em atendimento aparecem aqui para receber." />}
    </section>
    <div className="caixa-secondary"><CashierMenuShare /><CashierOnlineOrders /><PendingOrders /></div>
    <section className="caixa-shift" aria-label="Abertura e fechamento do caixa"><CashShiftPanel /></section>
    <Link className="secondary-button" href="/operacao/fiscal">Fiscal e contador</Link>
  </div></main>;
}
