import { headers } from "next/headers";
import { cache } from "react";
import type { PoolClient } from "pg";
import { query } from "@/lib/database";
export type RestaurantContext = {
  id: string;
  slug: string;
  name: string;
  plan: "essential" | "professional";
  accent_color: string;
  product_status: string;
  whatsapp: string | null;
  service_rate_basis_points: number;
};
const columns =
  "r.id,r.slug,r.name,r.plan,r.accent_color,r.product_status,r.whatsapp,r.service_rate_basis_points";
export const restaurantContext = cache(
  async (client?: PoolClient): Promise<RestaurantContext> => {
    const host =
      (await headers()).get("host")?.toLowerCase().split(":")[0] || "";
    const local =
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(host);
    const preview = Boolean(
      process.env.VERCEL_URL && host === process.env.VERCEL_URL.toLowerCase(),
    );
    const sql =
      local || preview
        ? `SELECT ${columns} FROM restaurants r WHERE r.slug=$1`
        : `SELECT ${columns} FROM restaurants r JOIN restaurant_domains d ON d.restaurant_id=r.id WHERE d.hostname=$1`;
    const values = [
      local || preview ? process.env.RESTAURANT_SLUG || "cantina-modelo" : host,
    ];
    const row = (
      client
        ? await client.query<RestaurantContext>(sql, values)
        : await query<RestaurantContext>(sql, values)
    ).rows[0];
    if (!row) throw new Error("Endereço não vinculado a um restaurante.");
    if (row.product_status === "suspended")
      throw new Error("Acesso a este restaurante está suspenso.");
    return row;
  },
);
export async function requireProfessional() {
  const current = await restaurantContext();
  if (current.plan !== "professional")
    throw new Error("Este recurso faz parte do plano Profissional.");
  return current;
}
