"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import type { Order } from "@/lib/domain";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function RefundOrderButton({ order }: { order: Order }) {
  const { session, refresh } = useRestaurant();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (
    !session ||
    !["admin", "manager"].includes(session.role) ||
    !order.paid ||
    order.status === "cancelled"
  )
    return null;
  async function submit() {
    setBusy(true);
    try {
      const r = await fetch(`/api/operations/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, confirmedReturned: confirmed }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error);
      await refresh();
      setOpen(false);
      toast.success("Estorno registrado e pedido cancelado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao estornar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="text-sm font-medium text-red-700"
        onClick={() => setOpen(true)}
      >
        Registrar devolução
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolução total · pedido #{order.number}</DialogTitle>
            <DialogDescription>
              Registre depois de devolver o dinheiro ou confirmar o cancelamento
              na adquirente. Esta ação não transfere dinheiro nem cancela uma
              nota fiscal.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Dinheiro sai do caixa aberto; Pix e cartões já liquidados saem do
            banco. Cartões ainda não liquidados são retirados dos valores a
            receber. Taxas já cobradas permanecem como despesa.
          </p>
          <label className="text-sm">
            Motivo
            <input
              className="mt-1 w-full rounded-lg border p-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmei a devolução integral em cada meio de pagamento.
          </label>
          <button
            className="primary-button"
            disabled={busy || !confirmed || reason.trim().length < 5}
            onClick={() => void submit()}
          >
            {busy ? "Registrando…" : "Registrar estorno e cancelar pedido"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
