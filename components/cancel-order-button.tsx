"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import type { Order } from "@/lib/domain";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export function CancelOrderButton({ order }: { order: Order }) {
  const { cancelOrder } = useRestaurant(); const [open, setOpen] = useState(false); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); const result = await cancelOrder(order.id, note.trim() || "Cancelamento confirmado"); setBusy(false); if (!result.ok) { toast.error(result.message); return; } setOpen(false); setNote(""); toast.success("Pedido cancelado e cozinha avisada."); };
  return <><button onClick={() => setOpen(true)} className="text-red-600 hover:underline">Cancelar</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>Cancelar pedido #{order.number}?</DialogTitle><DialogDescription>{order.status === "preparing" || order.status === "ready" ? "A cozinha será avisada imediatamente. Confirme somente se o pedido realmente não deve seguir." : "O pedido será removido da fila da cozinha imediatamente."}</DialogDescription></DialogHeader><div className="space-y-4"><label><span>Observação (opcional)</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={160} placeholder="Ex.: cliente desistiu" /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="secondary-button">Voltar</button><button type="button" onClick={() => void confirm()} disabled={busy} className="primary-button bg-red-600 hover:bg-red-700">{busy ? "Cancelando…" : "Confirmar cancelamento"}</button></div></div></DialogContent></Dialog></>;
}
