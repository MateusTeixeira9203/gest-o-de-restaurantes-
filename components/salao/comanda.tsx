"use client";

import { useState } from "react";
import { Bell, CreditCard, Plus, ReceiptText } from "lucide-react";
import { Topbar, Elapsed, NotFound } from "@/components/shared/blocos";
import { Carregando, Vazio } from "@/components/shared/estados";
import { SeloCanal, SeloEstado, type TomEstado } from "@/components/shared/selos";
import { MenuBuilder } from "@/components/cardapio/cardapio";
import { AccountCheckout } from "@/components/account-checkout";
import { ServedOrderButton } from "@/components/served-order-button";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal, type Order, type OrderStatus } from "@/lib/domain";

const pedidoEstado: Record<OrderStatus, { texto: string; tom: TomEstado }> = {
  pending: { texto: "Pendente", tom: "warn" }, confirmed: { texto: "Na fila", tom: "info" }, preparing: { texto: "Em preparo", tom: "warn" },
  ready: { texto: "Pronto para entregar", tom: "ok" }, out_for_delivery: { texto: "Em entrega", tom: "info" }, delivered: { texto: "Entregue", tom: "ok" },
  completed: { texto: "Concluído", tom: "neutral" }, cancelled: { texto: "Cancelado", tom: "danger" },
};

function PedidoComanda({ order, tableNumber }: { order: Order; tableNumber: number }) {
  return <article className="salao-order">
    <div className="salao-order-heading"><div className="salao-badges"><SeloCanal pedido={{ orderNumber: order.number, fulfillment: order.fulfillment ?? "dine_in", tableNumber }} /><SeloEstado {...pedidoEstado[order.status]} /></div><span className="salao-context"><Elapsed date={order.createdAt} /></span></div>
    <div className="salao-items">{order.items.map(item => <div key={item.id} className="salao-item"><div><p><span className="salao-quantity" aria-label={`${item.quantity} unidades`}>{item.quantity}</span> {item.productName} <span className="salao-context">· {item.variantName}</span></p>{item.addons.map(a => <p key={a.id} className="salao-context">+ {a.name}</p>)}{item.note && <p className="salao-note">Obs: {item.note}</p>}</div><strong>{money(item.quantity * (item.unitPrice + item.addons.reduce((a, b) => a + b.price, 0)))}</strong></div>)}</div>
    <div className="salao-order-actions"><ServedOrderButton order={order} /><CancelOrderButton order={order} /></div>
  </article>;
}

export function TableCommand({ tableId }: { tableId: string }) {
  const { state, ready } = useRestaurant();
  const [adding, setAdding] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const table = state.tables.find(t => t.id === tableId);
  const orders = state.orders.filter(o => o.tableId === tableId && o.status !== "cancelled" && o.status !== "completed");
  if (!ready) return <main className="app-page salao-page"><div className="page-container"><Topbar title="Comanda" subtitle="Carregando pedidos" back="/operacao/garcom" /><Carregando formato="lista" mensagem="Carregando comanda…" /></div></main>;
  if (!table) return <NotFound />;
  if (adding) return <MenuBuilder tableId={tableId} source="waiter" onBack={() => setAdding(false)} onSent={number => { setSent(number); setAdding(false); }} />;
  if (checkout) return <AccountCheckout tableId={tableId} onBack={() => setCheckout(false)} />;
  return <main className="app-page salao-page"><div className="page-container salao-command">
    <Topbar title={table.label || `Mesa ${String(table.number).padStart(2, "0")}`} subtitle={table.openedAt ? `Aberta às ${new Date(table.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sem atendimento aberto"} back="/operacao/garcom" />
    {sent !== null && <p className="salao-success" role="status">Pedido #{sent} · Enviado à cozinha</p>}
    {orders.some(o => o.status === "ready") && <div className="salao-ready"><Bell size={24} aria-hidden="true" /><div><strong>Pedido pronto para retirar</strong><p>A cozinha finalizou o pedido #{orders.find(o => o.status === "ready")?.number}.</p></div></div>}
    <section className="command-card"><div className="salao-command-heading"><div><h2 className="section-title">Comanda</h2><p className="salao-context">{orders.length ? `${orders.length} pedido(s) ativo(s)` : "Nenhum pedido nesta conta"}</p></div><button onClick={() => setAdding(true)} className="secondary-button"><Plus size={18} />Adicionar itens</button></div>
      {orders.map(order => <PedidoComanda key={order.id} order={order} tableNumber={table.number} />)}
      {!orders.length && <Vazio icone={ReceiptText} titulo="Esta conta está livre" descricao="Adicione os itens para começar o atendimento." />}
    </section>
    <footer className="salao-balance"><div><span className="salao-context">Saldo da comanda</span><strong>{money(tableTotal(state, tableId))}</strong></div>{orders.length > 0 && <button onClick={() => setCheckout(true)} className="secondary-button"><CreditCard size={18} />Pedir a conta</button>}</footer>
  </div></main>;
}
