import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/database";
import { currentRestaurant } from "@/modules/finance/service";
export async function snapshotRecipeCost(
  client: PoolClient,
  rid: string,
  variantId: string,
  addons: Array<{ id: string }>,
) {
  const components = (
    await client.query<{
      id: string;
      name: string;
      unit: string;
      quantity: string;
      average_cost_cents: string;
      cost_known: boolean;
    }>(
      `SELECT i.id,i.name,i.unit,r.quantity::text,i.average_cost_cents::text,i.cost_known FROM product_recipe_components r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.variant_id=$1 AND i.restaurant_id=$2 ORDER BY i.id FOR SHARE OF i`,
      [variantId, rid],
    )
  ).rows;
  const variant = (
    await client.query<{
      packaging_cost_cents: number;
      recipe_cost_complete: boolean;
      product_id: string;
    }>(
      "SELECT v.packaging_cost_cents,v.recipe_cost_complete,v.product_id FROM menu_variants v JOIN menu_products p ON p.id=v.product_id WHERE v.id=$1 AND p.restaurant_id=$2",
      [variantId, rid],
    )
  ).rows[0];
  const costs = addons.length
    ? (
        await client.query<{ id: string; cost_cents: number | null }>(
          "SELECT id,cost_cents FROM product_addons WHERE product_id=$1 AND id=ANY($2::uuid[])",
          [variant.product_id, addons.map((a) => a.id)],
        )
      ).rows
    : [];
  const baseCost = (
    await client.query<{ cost: string }>(
      `SELECT COALESCE(round(sum(r.quantity*i.average_cost_cents)),0)::text AS cost FROM product_recipe_components r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.variant_id=$1 AND i.restaurant_id=$2`,
      [variantId, rid],
    )
  ).rows[0].cost;
  const unitCostCents =
    Number(baseCost) +
    variant.packaging_cost_cents +
    costs.reduce((s, a) => s + (a.cost_cents ?? 0), 0);
  const complete =
    variant.recipe_cost_complete &&
    components.length > 0 &&
    components.every((i) => i.cost_known) &&
    costs.length === addons.length &&
    costs.every((a) => a.cost_cents !== null);
  return {
    capturedAt: new Date().toISOString(),
    coverage: complete ? "complete" : components.length ? "partial" : "absent",
    unitCostCents,
    packagingCostCents: variant.packaging_cost_cents,
    components,
    addons: costs,
  };
}
export async function costCatalog() {
  const rid = await currentRestaurant();
  const variants = (
    await query<{
      id: string;
      name: string;
      product_name: string;
      price_cents: number;
      packaging_cost_cents: number;
      recipe_cost_complete: boolean;
      ingredient_cost_cents: string;
      component_count: string;
      unknown_costs: string;
    }>(
      `SELECT v.id,v.name,p.name AS product_name,v.price_cents,v.packaging_cost_cents,v.recipe_cost_complete,COALESCE(round(sum(r.quantity*i.average_cost_cents)),0)::text AS ingredient_cost_cents,count(r.id) AS component_count,count(r.id) FILTER(WHERE NOT i.cost_known) AS unknown_costs FROM menu_variants v JOIN menu_products p ON p.id=v.product_id LEFT JOIN product_recipe_components r ON r.variant_id=v.id LEFT JOIN inventory_items i ON i.id=r.inventory_item_id WHERE p.restaurant_id=$1 GROUP BY v.id,p.name ORDER BY p.name,v.name`,
      [rid],
    )
  ).rows;
  const addons = (
    await query<{
      id: string;
      name: string;
      product_name: string;
      cost_cents: number | null;
    }>(
      "SELECT a.id,a.name,p.name AS product_name,a.cost_cents FROM product_addons a JOIN menu_products p ON p.id=a.product_id WHERE p.restaurant_id=$1 AND a.active ORDER BY p.name,a.name",
      [rid],
    )
  ).rows;
  return { variants, addons };
}
export async function saveCosts(
  input:
    | { variantId: string; packagingCostCents: number; complete: boolean }
    | { addonId: string; costCents: number },
) {
  return transaction(async (client) => {
    const rid = await currentRestaurant(client);
    if ("variantId" in input) {
      if (input.complete) {
        const count = (
          await client.query<{ n: string; unknown: string }>(
            "SELECT count(*) AS n,count(*) FILTER(WHERE NOT i.cost_known) AS unknown FROM product_recipe_components r JOIN inventory_items i ON i.id=r.inventory_item_id WHERE r.variant_id=$1 AND i.restaurant_id=$2",
            [input.variantId, rid],
          )
        ).rows[0];
        if (Number(count.n) === 0 || Number(count.unknown) > 0)
          throw new Error(
            "Cadastre a receita e o custo dos ingredientes antes de declarar o custo completo.",
          );
      }
      const row = await client.query(
        "UPDATE menu_variants v SET packaging_cost_cents=$3,recipe_cost_complete=$4 FROM menu_products p WHERE v.id=$1 AND v.product_id=p.id AND p.restaurant_id=$2 RETURNING v.id",
        [input.variantId, rid, input.packagingCostCents, input.complete],
      );
      if (!row.rowCount) throw new Error("Variação não encontrada.");
    } else {
      const row = await client.query(
        "UPDATE product_addons a SET cost_cents=$3 FROM menu_products p WHERE a.id=$1 AND a.product_id=p.id AND p.restaurant_id=$2 RETURNING a.id",
        [input.addonId, rid, input.costCents],
      );
      if (!row.rowCount) throw new Error("Adicional não encontrado.");
    }
    return { ok: true };
  });
}
