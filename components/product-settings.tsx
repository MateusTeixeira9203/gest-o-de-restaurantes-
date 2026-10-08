"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
export function ProductSettings() {
  const { session, refresh } = useRestaurant();
  const [value, setValue] = useState<{
    accentColor: string;
    plan: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/operations/product")
      .then((r) => r.json())
      .then((data) => {
        if (active) setValue(data as { accentColor: string; plan: string });
      })
      .catch(() => toast.error("Não foi possível carregar a personalização."));
    return () => {
      active = false;
    };
  }, []);
  if (!value) return null;
  return (
    <section className="settings-card">
      <h3>Gestor Food · Produto e identidade</h3>
      <p className="mt-2 text-sm text-neutral-500">
        Plano {value.plan === "professional" ? "Profissional" : "Essencial"}. A
        marca do restaurante permanece em toda a operação.
      </p>
      <label>
        <span>Cor principal</span>
        <input
          type="color"
          value={value.accentColor}
          onChange={(e) => setValue({ ...value, accentColor: e.target.value })}
        />
      </label>
      {session?.role === "admin" && (
        <label>
          <span>Plano contratado</span>
          <select
            value={value.plan}
            onChange={(e) => setValue({ ...value, plan: e.target.value })}
          >
            <option value="essential">Essencial</option>
            <option value="professional">Profissional</option>
          </select>
        </label>
      )}
      <button
        className="primary-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/operations/product", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                accentColor: value.accentColor,
                ...(session?.role === "admin" ? { plan: value.plan } : {}),
              }),
            });
            if (!r.ok) throw new Error("Não foi possível salvar.");
            await refresh();
            toast.success("Personalização salva.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar identidade e plano
      </button>
    </section>
  );
}
