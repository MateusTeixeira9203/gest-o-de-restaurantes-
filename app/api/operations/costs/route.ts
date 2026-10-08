import { requireProfessional } from "@/modules/tenancy/context";
import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { costCatalog, saveCosts } from "@/modules/costs/service";
const money = z.number().int().min(0).max(2_000_000_000);
const schema = z.union([
  z.object({
    variantId: z.string().uuid(),
    packagingCostCents: money,
    complete: z.boolean(),
  }),
  z.object({ addonId: z.string().uuid(), costCents: money }),
]);
export async function GET(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager"].includes(s.role))
    return Response.json(
      { error: "Acesso de gestão necessário." },
      { status: 403 },
    );
  await requireProfessional();
  return Response.json(await costCatalog(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function PUT(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager"].includes(s.role))
    return Response.json(
      { error: "Acesso de gestão necessário." },
      { status: 403 },
    );
  try {
    await requireProfessional();
    return Response.json(await saveCosts(schema.parse(await request.json())));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar custos." },
      { status: 400 },
    );
  }
}
