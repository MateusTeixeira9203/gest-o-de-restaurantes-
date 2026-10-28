"use client";

import { useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, orderTotal, type Order, type PaymentMethod } from "@/lib/domain";

const methods: PaymentMethod[] = ["Pix", "Dinheiro", "Débito", "Crédito"];
const expectedMethods = { pix: "Pix", cash: "Dinheiro", debit: "Débito", credit: "Crédito", prepaid: "Pix" } as const;

function receivedError(value: string, due: number) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return "Informe um valor entregue válido.";
  const cents = Math.round(Number(value.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || cents > 1000000) return "O valor entregue pode ser de no máximo R$ 10.000,00.";
  if (cents < due) return `O valor entregue precisa ser maior ou igual ao total (${money(due / 100)}).`;
  return "";
}

export function ExternalPaymentAction({ order }: { order: Order }) {
  const { refresh } = useRestaurant();
  const due = Math.max(0, (order.totalCents ?? Math.round(orderTotal(order) * 100)) - (order.paidCents ?? 0));
  const initialMethod = expectedMethods[order.expectedPaymentMethod ?? "pix"];
  const initialReceived = ((order.cashTenderedCents ?? due) / 100).toFixed(2);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [received, setReceived] = useState(initialReceived);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const cash = method === "Dinheiro";
  const error = cash ? receivedError(received, due) : "";
  const receivedCents = Math.round(Number(received.replace(",", ".")) * 100);
  const change = !error && cash ? Math.max(0, receivedCents - due) : 0;
  const confirm = async () => {
    if (submitting.current || error) return;
    submitting.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/operations/orders/${order.id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, ...(cash ? { receivedCents } : {}) }) });
      const result = await response.json() as { error?: string; changeCents: number };
      if (!response.ok) throw new Error(result.error || "Falha ao registrar pagamento.");
      await refresh(); setOpen(false); toast.success(`Pagamento do pedido #${order.number} registrado.${cash ? ` Troco: ${money(result.changeCents / 100)}` : ""}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao registrar pagamento."); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <><button onClick={() => { setMethod(initialMethod); setReceived(initialReceived); setOpen(true); }} className="secondary-button"><CreditCard size={16} /> Registrar pagamento</button>
    <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}><DialogContent className="rounded-3xl sm:max-w-sm">
      <DialogHeader><DialogTitle>Recebimento do pedido #{order.number}</DialogTitle><DialogDescription>Registre somente após conferir que o valor foi recebido. Esta ação não cobra o cliente automaticamente.</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="rounded-xl bg-neutral-50 p-4"><span className="text-sm text-neutral-500">Total a receber</span><strong className="block text-2xl">{money(due / 100)}</strong></div>
        <label className="admin-field"><span>Forma de pagamento</span><select value={method} disabled={busy} onChange={event => setMethod(event.target.value as PaymentMethod)}>{methods.map(value => <option key={value}>{value}</option>)}</select></label>
        {cash && <><label className="admin-field"><span>Valor entregue (R$)</span><input type="number" inputMode="decimal" min={due / 100} max={10000} step="0.01" value={received} disabled={busy} aria-invalid={Boolean(error)} style={{ fontSize: 16 }} onChange={event => setReceived(event.target.value)} /></label>
          {error ? <p role="alert">{error}</p> : <p aria-live="polite">Troco: {money(change / 100)}</p>}</>}
        <div className="admin-dialog-actions"><button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>Voltar</button><button className="primary-button" onClick={() => void confirm()} disabled={busy || Boolean(error)}>{busy ? "Registrando…" : "Confirmar recebimento"}</button></div>
      </div>
    </DialogContent></Dialog></>;
}

export function CashierOnlineOrders() {
  const { state } = useRestaurant();
  const orders = state.orders.filter(order => ["pickup", "delivery"].includes(order.fulfillment || "") && !["pending", "cancelled", "completed"].includes(order.status));
  return <section className="mt-8"><div className="mb-4"><h2 className="section-title">Pedidos online</h2><p className="mt-1 text-sm text-neutral-500">Retiradas e entregas para conferir e receber no caixa.</p></div><div className="orders-card-grid">{orders.map(order => <article key={order.id} className="orders-admin-card"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-neutral-500">Pedido #{order.number}</span><span className={`fulfillment-tag fulfillment-${order.fulfillment}`}>{order.fulfillment === "delivery" ? "Entrega" : "Retirada"}</span></div><h3>{order.customerName || "Cliente"}</h3></div><span className={order.paid ? "order-pill order-completed" : "order-pill order-pending"}>{order.paid ? "Pago" : "Receber"}</span></div><div className="delivery-items">{order.items.map(item => <p key={item.id}>{item.quantity}× {item.productName} <span>· {item.variantName}</span></p>)}</div><p className="my-3 text-sm text-neutral-500">{order.status === "ready" ? "Pronto" : order.status === "out_for_delivery" ? "Em rota" : order.status === "delivered" ? "Entregue" : "Em preparo"} · {money(Math.max(0,(order.totalCents??Math.round(orderTotal(order)*100))-(order.paidCents??0))/100)}</p>{!order.paid && (order.fulfillment === "delivery" || order.status === "ready") && <ExternalPaymentAction order={order} />}</article>)}</div>{!orders.length && <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-5 text-sm text-neutral-500">Nenhum pedido online pendente.</div>}</section>;
}
