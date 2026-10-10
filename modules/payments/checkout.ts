import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/database";
import { restaurantContext } from "@/modules/tenancy/context";
export function accountVersion(orders: Array<{ id: string; total_cents: number; paid: string | number }>) {
  return createHash("sha256").update(JSON.stringify(orders.map(o => [o.id, o.total_cents, Number(o.paid)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}
export async function checkoutAccount(tableNumber: number) {
  const r = await restaurantContext();
  const result = await query<{ id: string; total_cents: number; paid: string; status: string }>(`SELECT o.id,o.total_cents,o.status,COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id AND status='paid'),0) AS paid FROM orders o JOIN dining_tables t ON t.id=o.table_id WHERE o.restaurant_id=$1 AND t.number=$2 AND o.status NOT IN ('completed','cancelled') ORDER BY o.id`, [r.id,tableNumber]);
  return { restaurantId: r.id, version: accountVersion(result.rows), dueCents: result.rows.reduce((n,o)=>n+Math.max(0,o.total_cents-Number(o.paid)),0), pending: result.rows.some(o=>o.status==="pending") };
}
export async function receivingSettings(restaurantId: string, client?: PoolClient) {
  const sql = "SELECT pix_enabled,pix_key,pix_name,pix_city FROM restaurant_payment_settings WHERE restaurant_id=$1";
  const result = client ? await client.query(sql,[restaurantId]) : await query(sql,[restaurantId]);
  return result.rows[0] ?? { pix_enabled: false, pix_key: "", pix_name: "", pix_city: "" };
}
