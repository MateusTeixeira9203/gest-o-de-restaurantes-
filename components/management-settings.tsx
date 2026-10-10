"use client";

import { ProductSettings } from "./product-settings";
import Link from "next/link";
import { PaymentReceivingSettings } from "@/components/payment-receiving-settings";
import { useState } from "react";
import { Copy, QrCode, Store, Palette, WalletCards, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import { RestaurantBrandingSettings } from "@/components/restaurant-branding-settings";
import { FiscalConfiguration } from "@/components/fiscal-workspace";

type Section = "restaurant" | "appearance" | "payments" | "fiscal";
const sections = [
  { id: "restaurant", label: "Restaurante", description: "Dados e atendimento", icon: Store },
  { id: "appearance", label: "Aparência", description: "Logo, capa e cores", icon: Palette },
  { id: "payments", label: "Pagamentos", description: "Recebimento por Pix", icon: WalletCards },
  { id: "fiscal", label: "Notas fiscais", description: "Empresa e emissão", icon: ReceiptText },
] as const;

export function ManagementSettings({ initialSection = "restaurant" }: { initialSection?: Section }) {
  const { state, updateSettings, plan } = useRestaurant();
  const [section, setSection] = useState(initialSection);
  const [visited, setVisited] = useState<Section[]>([initialSection]);
  const [value, setValue] = useState(state.settings);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const result = await updateSettings(value);
      if (result.ok) toast.success("Dados do restaurante salvos.");
      else toast.error(result.message);
    } catch { toast.error("Não foi possível salvar. Confira a conexão e tente novamente."); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/menu/entrega`); toast.success("Link do cardápio para entrega copiado."); }
    catch { toast.error("Não foi possível copiar o link."); }
  };
  function navigate(id: Section) { setSection(id); setVisited(v => v.includes(id) ? v : [...v, id]); }
  return <section className="settings-workspace">
    <div className="page-heading"><div><h2>Configurações</h2><p>Escolha o que deseja ajustar no seu restaurante.</p></div></div>
    <div className="settings-shell">
      <nav className="settings-navigation" aria-label="Seções de configuração">
        {sections.filter(s => s.id !== "fiscal" || plan === "professional").map(({ id, label, description, icon: Icon }) =>
          <button key={id} onClick={() => navigate(id)} aria-pressed={section === id} aria-controls={`settings-${id}`}>
            <Icon size={20}/><span><strong>{label}</strong><small>{description}</small></span>
          </button>)}
      </nav>
      <div className="settings-content">
        <div id="settings-restaurant" hidden={section !== "restaurant"} className="settings-section">
          <section className="settings-card"><h3>Seu restaurante</h3><p>Informações usadas nas telas da equipe e no cardápio.</p>
            <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy}>
              <div className="settings-form-grid"><label><span>Nome do restaurante</span><input value={value.name} onChange={e => setValue(v => ({ ...v, name: e.target.value }))}/></label>
              <label><span>WhatsApp de contato</span><input value={value.whatsapp} onChange={e => setValue(v => ({ ...v, whatsapp: e.target.value }))}/></label></div>
              <label className="settings-short-field"><span>Taxa de serviço (%)</span><input type="number" min="0" max="100" value={value.serviceRate} onChange={e => setValue(v => ({ ...v, serviceRate: Number(e.target.value) }))}/></label>
              <div className="settings-save-row"><button className="primary-button">{busy ? "Salvando…" : "Salvar dados"}</button></div>
            </fieldset></form>
          </section>
          <section className="settings-card"><h3>Cardápio e atendimento</h3><p>Compartilhe o cardápio de entrega ou abra a área de mesas para gerar os QR Codes.</p><div className="settings-link-actions"><button onClick={() => void copy()} className="secondary-button"><Copy size={16}/>Copiar link de entrega</button><Link href="/gestao/mesas" className="secondary-button"><QrCode size={16}/>QR das mesas</Link></div><p className="settings-hint">Pedidos do cardápio passam pela aprovação da equipe antes de chegar à cozinha.</p></section>
        </div>
        <div id="settings-appearance" hidden={section !== "appearance"} className="settings-section">{visited.includes("appearance") && <><RestaurantBrandingSettings/><ProductSettings/></>}</div>
        <div id="settings-payments" hidden={section !== "payments"} className="settings-section">{visited.includes("payments") && <PaymentReceivingSettings/>}</div>
        {plan === "professional" && <div id="settings-fiscal" hidden={section !== "fiscal"} className="settings-section">{visited.includes("fiscal") && <FiscalConfiguration/>}</div>}
      </div>
    </div>
  </section>;
}
