import { getCurrentEstimate } from "@/lib/restaurant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json({ minutes: await getCurrentEstimate() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Estimativa indisponível." }, { status: 503 }); }
}
