import { getOperationSnapshot } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try {
    return Response.json(await getOperationSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível carregar a operação." }, { status: 503 });
  }
}
