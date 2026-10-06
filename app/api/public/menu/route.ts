import { getPublicMenu } from "@/lib/restaurant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPublicMenu(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível carregar o cardápio." }, { status: 503 });
  }
}
