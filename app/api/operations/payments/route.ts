import { z } from "zod";
import { closeTable } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const bodySchema = z.object({ tableNumber: z.number().int().positive(), allowPartial: z.boolean().optional(), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(), payments: z.array(z.object({ method: z.enum(["Pix", "Dinheiro", "Débito", "Crédito"]), amountCents: z.number().int().positive().max(2_000_000_000) })).min(1).max(12) });

export async function POST(request: Request) {
  if (!(await hasStaffSession(request, ["cashier", "waiter", "manager"]))) return Response.json({ error: "Acesso de caixa ou garçom necessário." }, { status: 403 });
  try {
    const body = bodySchema.parse(await request.json());
    if (body.allowPartial && !body.expectedVersion) throw new Error("Atualize a conta antes de receber parcialmente.");
    const actor = await sessionFromRequest(request);
    if (!actor) return Response.json({ error: "Sessão expirada." }, { status: 401 });
    return Response.json(await closeTable(body.tableNumber, body.payments, { role: actor.role, name: actor.username }, z.string().uuid().parse(request.headers.get("idempotency-key")), body.expectedVersion ? { allowPartial: body.allowPartial ?? false, expectedVersion: body.expectedVersion } : undefined));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." }, { status: 400 });
  }
}
