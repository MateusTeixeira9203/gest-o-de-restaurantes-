"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { money } from "@/lib/domain";
import type { costCatalog } from "@/modules/costs/service";
type Catalog = Awaited<ReturnType<typeof costCatalog>>;
export function CostManagement() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/operations/costs", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar os custos.");
        return r.json() as Promise<Catalog>;
      })
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(body: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/operations/costs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(result.error);
      const fresh = await fetch("/api/operations/costs");
      if (fresh.ok) setCatalog((await fresh.json()) as Catalog);
      toast.success("Custos salvos para os próximos pedidos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">Custos e fichas técnicas</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Cadastre os ingredientes e quantidades por porção em Estoque. Confira
          aqui embalagem e adicionais. Pedidos já aprovados preservam seus
          custos históricos.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {!catalog ? (
        <p>Carregando…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {catalog.variants.map((v) => {
              const cost =
                Number(v.ingredient_cost_cents) + v.packaging_cost_cents;
              return (
                <form
                  key={v.id}
                  className="command-card space-y-3 p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save({
                      variantId: v.id,
                      packagingCostCents: Math.round(
                        Number(f.get("packaging")) * 100,
                      ),
                      complete: f.get("complete") === "on",
                    });
                  }}
                >
                  <h3 className="font-semibold">
                    {v.product_name} · {v.name}
                  </h3>
                  <p className="text-sm text-neutral-500">
                    {v.component_count} ingredientes · Venda{" "}
                    {money(v.price_cents / 100)} · Custo base{" "}
                    {money(cost / 100)}
                  </p>
                  <p className="text-sm">
                    {Number(v.component_count) === 0
                      ? "Receita não cadastrada"
                      : Number(v.unknown_costs) > 0
                        ? "Há ingredientes sem custo conhecido"
                        : `Diferença antes de taxas e despesas: ${money((v.price_cents - cost) / 100)}`}
                  </p>
                  <label className="block text-sm">
                    Embalagem por unidade (R$)
                    <input
                      key={v.packaging_cost_cents}
                      name="packaging"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={(v.packaging_cost_cents / 100).toFixed(2)}
                      className="mt-1 w-full rounded-xl border p-2"
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      name="complete"
                      type="checkbox"
                      key={String(v.recipe_cost_complete)}
                      defaultChecked={v.recipe_cost_complete}
                      className="mt-1"
                    />
                    Conferi todos os ingredientes e a embalagem desta porção.
                  </label>
                  <button disabled={busy} className="primary-button">
                    Salvar conferência
                  </button>
                </form>
              );
            })}
          </div>
          <h2 className="section-title">Custos dos adicionais</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.addons.map((a) => (
              <form
                key={a.id}
                className="command-card space-y-3 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save({
                    addonId: a.id,
                    costCents: Math.round(Number(f.get("cost")) * 100),
                  });
                }}
              >
                <h3 className="font-semibold">
                  {a.product_name} · {a.name}
                </h3>
                <label className="block text-sm">
                  Custo unitário (R$)
                  <input
                    name="cost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={
                      a.cost_cents === null
                        ? ""
                        : (a.cost_cents / 100).toFixed(2)
                    }
                    className="mt-1 w-full rounded-xl border p-2"
                  />
                </label>
                <button disabled={busy} className="primary-button">
                  Salvar custo
                </button>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
