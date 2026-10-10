"use client";

import { ProductSettings } from "./product-settings";
import Link from "next/link";
import { PaymentReceivingSettings } from "@/components/payment-receiving-settings";
import { useState } from "react";
import { Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import { RestaurantBrandingSettings } from "@/components/restaurant-branding-settings";

export function ManagementSettings() {
  const { state, updateSettings, plan } = useRestaurant();
  const [value, setValue] = useState(state.settings);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); const result = await updateSettings(value); setBusy(false); if (result.ok) toast.success("Configurações salvas."); else toast.error(result.message); };
  const copy = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/menu/entrega`); toast.success("Link do cardápio para entrega copiado."); } catch { toast.error("Não foi possível copiar o link."); } };
  return <><div className="page-heading"><div><h2>Configurações</h2><p>Dados do restaurante, identidade do cardápio e links de atendimento.</p></div></div><div className="settings-layout"><section className="settings-card"><h3>Dados do restaurante</h3><label><span>Nome do restaurante</span><input value={value.name} onChange={event => setValue(current => ({ ...current, name: event.target.value }))} /></label><label><span>WhatsApp de contato</span><input value={value.whatsapp} onChange={event => setValue(current => ({ ...current, whatsapp: event.target.value }))} /></label><label><span>Taxa de serviço (%)</span><input type="number" min="0" max="100" value={value.serviceRate} onChange={event => setValue(current => ({ ...current, serviceRate: Number(event.target.value) }))} /></label><button onClick={() => void save()} disabled={busy} className="primary-button">{busy ? "Salvando…" : "Salvar alterações"}</button></section><section className="settings-card"><h3>Cardápio e QR Code</h3><p className="mt-2 text-sm text-neutral-500">Compartilhe o link de entrega pelo WhatsApp: ele solicita nome e endereço, e registra uma solicitação para conferência de garçom ou caixa antes de chegar à cozinha. Para uso presencial, gere o QR de cada mesa em Mesas.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void copy()} className="secondary-button"><Copy size={16} /> Copiar link de entrega</button><Link href="/gestao/mesas" className="secondary-button"><QrCode size={16} /> QR das mesas</Link></div></section>{plan === "professional" && <section className="settings-card"><h3>Fiscal</h3><p className="mt-2 text-sm text-neutral-500">Dados da empresa, regras dos produtos e ambiente de emissão.</p><Link href="/gestao/configuracoes/fiscal" className="secondary-button mt-5">Configurar emissão fiscal</Link></section>}<PaymentReceivingSettings /><RestaurantBrandingSettings /><ProductSettings /></div></>;
}
