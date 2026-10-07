"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";

type BrandKind = "logo" | "cover";

function BrandingImage({ kind }: { kind: BrandKind }) {
  const { branding, state, refresh } = useRestaurant();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isLogo = kind === "logo";
  const customUrl = isLogo ? branding.logoUrl : branding.coverUrl;
  const imageUrl = customUrl || (isLogo ? "/patos-lanches-logo.png" : "/menu-hero.png");

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      toast.error("Use uma imagem JPG, PNG ou WebP de até 5 MB.");
      return;
    }
    const form = new FormData();
    form.set("image", file);
    setBusy(true);
    try {
      const response = await fetch(`/api/operations/branding/${kind}`, { method: "PUT", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Falha ao enviar a imagem.");
      }
      await refresh();
      toast.success(isLogo ? "Logo atualizado no cardápio." : "Capa atualizada no cardápio.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`Voltar à imagem padrão de ${isLogo ? "logo" : "capa"}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/operations/branding/${kind}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível remover a imagem.");
      await refresh();
      toast.success("Imagem padrão restaurada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível restaurar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="brand-upload-card">
    <div className={`brand-upload-preview ${isLogo ? "brand-upload-logo" : "brand-upload-cover"}`}>
      <Image src={imageUrl} alt={isLogo ? `Logo de ${state.settings.name}` : `Capa do cardápio de ${state.settings.name}`} fill sizes={isLogo ? "160px" : "(max-width: 720px) 100vw, 440px"} unoptimized={Boolean(customUrl)} className={isLogo ? "object-contain" : "object-cover"} />
    </div>
    <div className="brand-upload-copy">
      <h4>{isLogo ? "Logo do restaurante" : "Foto de capa"}</h4>
      <p>{isLogo ? "Aparece no topo do cardápio e nas telas da equipe. Prefira PNG com fundo transparente." : "É a primeira foto que o cliente vê no link de WhatsApp e no QR da mesa. Prefira uma foto horizontal."}</p>
      <div className="brand-upload-actions">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
        <button type="button" className="secondary-button" disabled={busy} onClick={() => inputRef.current?.click()}><ImageUp size={16} /> {busy ? "Aguarde…" : customUrl ? "Trocar imagem" : "Enviar imagem"}</button>
        {customUrl && <button type="button" className="brand-remove-button" disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Usar padrão</button>}
      </div>
      <span className="brand-upload-hint">JPG, PNG ou WebP · até 5 MB · otimização automática</span>
    </div>
  </div>;
}

export function RestaurantBrandingSettings() {
  return <section className="settings-card settings-brand-card">
    <div className="settings-brand-intro"><div><h3>Visual do cardápio</h3><p>Personalize o link compartilhado pelo WhatsApp e o QR das mesas. Os pedidos continuam registrados no sistema.</p></div><span>Prévia em tempo real</span></div>
    <div className="brand-upload-grid"><BrandingImage kind="logo" /><BrandingImage kind="cover" /></div>
  </section>;
}
