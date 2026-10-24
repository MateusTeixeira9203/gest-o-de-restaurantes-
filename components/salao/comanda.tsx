"use client";

import { useState } from "react";
import { Bell, CreditCard, Plus, ReceiptText } from "lucide-react";
import { Topbar, StatusPill, OrderPill, Elapsed, NotFound } from "@/components/shared/blocos";
import { MenuBuilder } from "@/components/cardapio/cardapio";
import { AccountCheckout } from "@/components/account-checkout";
import { ServedOrderButton } from "@/components/served-order-button";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal } from "@/lib/domain";

export function TableCommand({ tableId }: { tableId: string }) {
  const { state } = useRestaurant(); const [adding, setAdding] = useState(false); const [checkout, setCheckout] = useState(false);
  const table = state.tables.find(t => t.id === tableId); const orders = state.orders.filter(o => o.tableId === tableId && o.status !== "cancelled" && o.status !== "completed");
  if (!table) return <NotFound />;
  if (adding) return <MenuBuilder tableId={tableId} source="waiter" onBack={() => setAdding(false)} onSent={() => setAdding(false)} />;
  if (checkout) return <AccountCheckout tableId={tableId} onBack={() => setCheckout(false)} />;
  const total = tableTotal(state, tableId);
return <main className="app-page"><div className="page-container max-w-4xl"><Topbar title={table.label || `Mesa / comanda ${String(table.number).padStart(2, "0")}`} subtitle={table.openedAt ? `Aberta às ${new Date(table.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sem atendimento aberto"} back="/operacao/garcom" action={<StatusPill status={table.status} />} />{orders.some(o => o.status === "ready") && <div className="ready-banner"><div className="ready-icon"><Bell size={20} /></div><div><strong>Pedido pronto para retirar</strong><p>A cozinha finalizou o pedido #{orders.find(o => o.status === "ready")?.number}.</p></div></div>}<section className="command-card"><div className="flex items-center justify-between border-b border-neutral-200 p-5 sm:p-6"><div><h2 className="section-title">Comanda</h2><p className="mt-1 text-sm text-neutral-500">{orders.length ? `${orders.length} pedido(s) ativo(s)` : "Nenhum pedido nesta conta"}</p></div><button onClick={() => setAdding(true)} className="primary-button"><Plus size={18} /> Adicionar pedido</button></div><div className="divide-y divide-neutral-100">{orders.map(order => <div key={order.id} className="p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="order-number">#{order.number}</span><OrderPill status={order.status} /></div><div className="flex items-center gap-3 text-xs text-neutral-500"><Elapsed date={order.createdAt} /><ServedOrderButton order={order} /><CancelOrderButton order={order} /></div></div><div className="space-y-3">{order.items.map(item => <div key={item.id} className="flex justify-between gap-4"><div><p className="font-medium">{item.quantity}× {item.productName} <span className="text-neutral-400">· {item.variantName}</span></p>{item.addons.map(a => <p key={a.id} className="text-sm text-neutral-500">+ {a.name}</p>)}{item.note && <p className="mt-1 text-sm font-medium text-amber-700">Obs: {item.note}</p>}</div><strong className="whitespace-nowrap">{money(item.quantity * (item.unitPrice + item.addons.reduce((a, b) => a + b.price, 0)))}</strong></div>)}</div></div>)}{!orders.length && <div className="empty-state"><ReceiptText size={28} /><p>Esta conta está livre.</p><button onClick={() => setAdding(true)} className="secondary-button">Abrir com um pedido</button></div>}</div>{orders.length > 0 && <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 p-5 sm:p-6"><span className="text-sm font-medium text-neutral-500">Saldo da comanda</span><strong className="text-2xl tracking-tight">{money(total)}</strong><button onClick={() => setCheckout(true)} className="primary-button">Fechar conta <CreditCard size={17} /></button></div>}</section></div></main>;
}
