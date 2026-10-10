import { sessionFromRequest } from "@/lib/staff-session";
import { requireProfessional } from "@/modules/tenancy/context";
import { accountBatch, accountsFilter, listAccounts, submitAccounts } from "@/modules/fiscal/accounts";
import { z } from "zod";
export const maxDuration = 120;
async function session(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager", "cashier"].includes(s.role)) return null;
  await requireProfessional();
  return s;
}
const failure = (e: unknown) => Response.json({ error: e instanceof z.ZodError ? "Seleção ou período inválido." : e instanceof Error ? e.message : "Fiscal indisponível." }, { status: 400 });
export async function GET(request: Request) {
  try {
    const s = await session(request);
    if (!s) return Response.json({ error: "Acesso fiscal necessário." }, { status: 403 });
    return Response.json(await listAccounts(s.restaurantId, accountsFilter.parse(Object.fromEntries(new URL(request.url).searchParams))), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const s = await session(request);
    if (!s) return Response.json({ error: "Acesso fiscal necessário." }, { status: 403 });
    return Response.json(await submitAccounts(s.restaurantId, accountBatch.parse(await request.json()), { role: s.role, name: s.username }));
  } catch (e) { return failure(e); }
}
