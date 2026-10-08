"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import type { Order } from "@/lib/domain";
export function ServedOrderButton({ order }: { order: Order }) {
  const { updateOrderStatus } = useRestaurant();
  const [busy, setBusy] = useState(false);
  if (
    order.status !== "ready" ||
    order.fulfillment === "delivery" ||
    order.servedAt
  )
    return null;
  return (
    <button
      className="primary-button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await updateOrderStatus(order.id, "delivered");
          if (result.ok) toast.success("Atendimento registrado.");
          else toast.error(result.message);
        } catch {
          toast.error("Confira a conexão e atualize o pedido.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy
        ? "Salvando…"
        : order.fulfillment === "pickup"
          ? "Confirmar retirada"
          : "Marcar servido"}
    </button>
  );
}
