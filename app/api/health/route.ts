import { isDatabaseConfigured, query } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) return Response.json({ ok: false, database: "not_configured" }, { status: 503 });
  try {
    await query("SELECT 1");
    return Response.json({ ok: true, database: "connected" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
