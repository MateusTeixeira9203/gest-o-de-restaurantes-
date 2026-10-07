"use client";

import { useEffect, useState } from "react";
import { Clock3, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/domain";

export type CustomerCheckoutValue = { name: string; phone: string; fulfillment: "dine_in" | "pickup" | "delivery"; addressLine1?: string; neighborhood?: string; reference?: string; latitude?: number; longitude?: number };

export function CustomerCheckoutDialog({ open, onOpenChange, tableId, deliveryOnly = false, total, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; tableId?: string; deliveryOnly?: boolean; total: number; onConfirm: (value: CustomerCheckoutValue) => Promise<boolean> }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(deliveryOnly ? "delivery" : "pickup");
  const [addressLine1, setAddressLine1] = useState(""); const [neighborhood, setNeighborhood] = useState(""); const [reference, setReference] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null); const [busy, setBusy] = useState(false); const [locating, setLocating] = useState(false);
  useEffect(() => { if (!open) return; void fetch("/api/public/estimate").then(response => response.json()).then(value => setEstimate((value as { minutes?: number }).minutes ?? null)).catch(() => setEstimate(null)); }, [open]);
  const locate = () => {
    if (!navigator.geolocation) { toast.error("Seu dispositivo não permite localização."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => { setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false); toast.success("Localização adicionada. Confira também o endereço escrito."); }, () => { setLocating(false); toast.error("Localização não autorizada. Digite o endereço normalmente."); }, { enableHighAccuracy: false, timeout: 10000 });
  };
  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Informe seu nome para identificar o pedido."); return; }
    if (phone.replace(/\D/g, "").length < 8) { toast.error("Informe um WhatsApp válido para contato."); return; }
    if (!tableId && (deliveryOnly || fulfillment === "delivery") && addressLine1.trim().length < 4) { toast.error("Informe rua e número para entrega."); return; }
    setBusy(true);
    try {
      const done = await onConfirm({ name: name.trim(), phone: phone.trim(), fulfillment: tableId ? "dine_in" : deliveryOnly ? "delivery" : fulfillment, addressLine1: addressLine1.trim(), neighborhood: neighborhood.trim(), reference: reference.trim(), ...location });
      if (done) onOpenChange(false);
    } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}><DialogContent className="customer-checkout-dialog"><DialogHeader><DialogTitle>Confirmar pedido</DialogTitle><DialogDescription>{tableId ? `O pedido será enviado à cozinha para a mesa ${tableId}.` : deliveryOnly ? "Pedido para entrega. Informe seus dados e o endereço para o motoboy." : "Escolha retirada ou entrega; o pedido entra direto na nossa fila."}</DialogDescription></DialogHeader><div className="customer-checkout-form">{estimate !== null && <p className="estimate-note"><Clock3 size={17} /> Preparo estimado: cerca de {estimate} min. Pode variar conforme a fila e a entrega.</p>}{!tableId && !deliveryOnly && <div className="table-mode-switch"><button className={fulfillment === "pickup" ? "active" : ""} onClick={() => setFulfillment("pickup")}>Retirar no balcão</button><button className={fulfillment === "delivery" ? "active" : ""} onClick={() => setFulfillment("delivery")}>Receber em casa</button></div>}{deliveryOnly && <p className="delivery-checkout-label"><MapPin size={16} /> Entrega no endereço informado abaixo</p>}<div className="grid grid-cols-2 gap-3"><label className="admin-field"><span>Seu nome *</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos chamar?" autoComplete="name" /></label><label className="admin-field"><span>WhatsApp *</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="(38) 99999-9999" type="tel" autoComplete="tel" /></label></div>{!tableId && (deliveryOnly || fulfillment === "delivery") && <><label className="admin-field"><span>Rua e número *</span><input value={addressLine1} onChange={event => setAddressLine1(event.target.value)} placeholder="Ex.: Rua das Flores, 123" autoComplete="street-address" /></label><div className="grid grid-cols-2 gap-3"><label className="admin-field"><span>Bairro</span><input value={neighborhood} onChange={event => setNeighborhood(event.target.value)} /></label><label className="admin-field"><span>Referência</span><input value={reference} onChange={event => setReference(event.target.value)} placeholder="Próximo à praça" /></label></div><button type="button" onClick={locate} disabled={locating} className="secondary-button"><MapPin size={16} /> {location ? "Localização adicionada" : locating ? "Localizando…" : "Usar minha localização (opcional)"}</button><p className="text-xs text-neutral-500">A localização ajuda o motoboy, mas não substitui rua e número.</p></>}</div><div className="customer-checkout-actions"><div><span>Total dos itens</span><strong>{money(total)}</strong></div><button disabled={busy} onClick={() => void submit()} className="primary-button">{busy ? "Enviando…" : "Confirmar e enviar pedido"}</button></div></DialogContent></Dialog>;
}
