import { getKitchenQueue } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export const dynamic = "force-dynamic";

async function hasInternalAccess(request: Request) {
  const secret = process.env.RESTAURANT_INTERNAL_API_KEY;
  return (await hasStaffSession(request, ["kitchen", "manager"])) || Boolean(secret && request.headers.get("x-restaurant-internal-key") === secret);
}

export async function GET(request: Request) {
  if (!(await hasInternalAccess(request))) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const sector = new URL(request.url).searchParams.get("sector") || undefined;
  try {
    return Response.json({ tickets: await getKitchenQueue(sector) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível carregar a fila da cozinha." }, { status: 503 });
  }
}
