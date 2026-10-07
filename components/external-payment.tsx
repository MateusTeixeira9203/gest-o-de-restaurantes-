"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, orderTotal, type Order, type PaymentMethod } from "@/lib/domain";

const methods: PaymentMethod[] = ["Pix", "Dinheiro", "Débito", "Crédito"];

export function ExternalPaymentAction({ order }: { order: Order }) {
  const { refresh } = useRestaurant();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("Pix");
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/operations/orders/${order.id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Falha ao registrar pagamento.");
      await refresh(); setOpen(false); toast.success(`Pagamento do pedido #${order.number} registrado.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao registrar pagamento."); }
    finally { setBusy(false); }
  };
  return <><button onClick={() => setOpen(true)} className="secondary-button"><CreditCard size={16} /> Registrar pagamento</button><Dialog open={open} onOpenChange={value => !busy && setOpen(value)}><DialogContent className="rounded-3xl sm:max-w-sm"><DialogHeader><DialogTitle>Recebimento do pedido #{order.number}</DialogTitle><DialogDescription>Registre somente após conferir que o valor foi recebido. Esta ação não cobra o cliente automaticamente.</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-xl bg-neutral-50 p-4"><span className="text-sm text-neutral-500">Total a receber</span><strong className="block text-2xl">{money(orderTotal(order))}</strong></div><label className="admin-field"><span>Forma de pagamento</span><select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}>{methods.map(value => <option key={value}>{value}</option>)}</select></label><div className="admin-dialog-actions"><button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>Voltar</button><button className="primary-button" onClick={() => void confirm()} disabled={busy}>{busy ? "Registrando…" : "Confirmar recebimento"}</button></div></div></DialogContent></Dialog></>;
}

export function CashierOnlineOrders() {
  const { state } = useRestaurant();
  const orders = state.orders.filter(order => ["pickup", "delivery"].includes(order.fulfillment || "") && !["cancelled", "completed"].includes(order.status));
  return <section className="mt-8"><div className="mb-4"><h2 className="section-title">Pedidos online</h2><p className="mt-1 text-sm text-neutral-500">Retiradas e entregas para conferir e receber no caixa.</p></div><div className="orders-card-grid">{orders.map(order => <article key={order.id} className="orders-admin-card"><div className="flex items-start justify-between gap-3"><div><span className="text-xs text-neutral-500">Pedido #{order.number} · {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}</span><h3>{order.customerName || "Cliente"}</h3></div><span className={order.paid ? "order-pill order-completed" : "order-pill order-pending"}>{order.paid ? "Pago" : "Receber"}</span></div><p className="my-3 text-sm text-neutral-500">{order.status === "ready" ? "Pronto" : order.status === "out_for_delivery" ? "Em rota" : order.status === "delivered" ? "Entregue" : "Em preparo"} · {money(orderTotal(order))}</p>{!order.paid && (order.fulfillment === "delivery" || order.status === "ready") && <ExternalPaymentAction order={order} />}</article>)}</div>{!orders.length && <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-5 text-sm text-neutral-500">Nenhum pedido online pendente.</div>}</section>;
}
