import { z } from "zod";
import { closeTable } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const bodySchema = z.object({ tableNumber: z.number().int().positive(), payments: z.array(z.object({ method: z.enum(["Pix", "Dinheiro", "Débito", "Crédito"]), amountCents: z.number().int().positive() })).min(1) });

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["cashier", "waiter", "manager"])) return Response.json({ error: "Acesso de caixa ou garçom necessário." }, { status: 403 });
  try {
    const body = bodySchema.parse(await request.json());
    const actor = sessionFromRequest(request);
    if (!actor) return Response.json({ error: "Sessão expirada." }, { status: 401 });
    return Response.json(await closeTable(body.tableNumber, body.payments, { role: actor.role, name: actor.username }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." }, { status: 400 });
  }
}
