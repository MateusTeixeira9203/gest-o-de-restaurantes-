"use client";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { SeloCanal } from "@/components/shared/selos";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, orderTotal } from "@/lib/domain";
export function PendingOrders() {
  const { state, reviewOrder } = useRestaurant();
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const orders = state.orders.filter((order) => order.status === "pending");
  if (!orders.length) return null;
  async function review(
    id: string,
    revision: number,
    decision: "approve" | "reject",
  ) {
    setBusy(id);
    try {
      const result = await reviewOrder(id, revision, decision, reasons[id]);
      if (!result.ok) toast.error(result.message);
      else
        toast.success(
          decision === "approve"
            ? "Pedido enviado para a cozinha."
            : "Pedido recusado.",
        );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="caixa-pending my-6">
      <h2 className="section-title">Conferir pedidos ({orders.length})</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Confira os itens com o cliente. A produção começa somente ao enviar para
        a cozinha.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {orders.map((order) => (
          <article key={order.id} className="caixa-pending-order">
            <div className="flex justify-between gap-2">
              <SeloCanal pedido={{ fulfillment: order.fulfillment ?? "dine_in", orderNumber: order.number, tableNumber: Number(order.tableId) || null }} />
              <strong>{money(orderTotal(order))}</strong>
            </div>
            <p className="text-sm text-neutral-500">{order.customerName}</p>
            <ul className="my-3 space-y-2 text-sm">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="caixa-item-quantity">{item.quantity}<X size={12} aria-hidden="true" /></span> {item.productName} · {item.variantName}
                  {item.addons.length > 0 && (
                    <p>
                      Adicionais:{" "}
                      {item.addons.map((addon) => addon.name).join(", ")}
                    </p>
                  )}
                  {item.note && (
                    <p className="caixa-note">Observação: {item.note}</p>
                  )}
                </li>
              ))}
            </ul>
            <button disabled={busy !== null} onClick={() => void review(order.id, order.revision, "approve")} className="secondary-button w-full justify-center">
              {busy === order.id ? "Processando…" : "Conferir e enviar para cozinha"}
            </button>
            <div className="mt-3 flex gap-2">
              <input
                aria-label={`Motivo da recusa do pedido ${order.number}`}
                className="min-w-0 flex-1 rounded-lg border p-2 text-sm"
                placeholder="Motivo para recusar"
                value={reasons[order.id] || ""}
                onChange={(event) =>
                  setReasons({ ...reasons, [order.id]: event.target.value })
                }
              />
              <button disabled={busy !== null || !reasons[order.id]?.trim()} className="caixa-reject" onClick={() => void review(order.id, order.revision, "reject")}>
                Recusar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
