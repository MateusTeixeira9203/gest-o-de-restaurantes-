import { z } from "zod";
import { closeTable } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ tableNumber: z.number().int().positive(), payments: z.array(z.object({ method: z.enum(["Pix", "Dinheiro", "Débito", "Crédito"]), amountCents: z.number().int().positive() })).min(1) });

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["cashier", "manager"])) return Response.json({ error: "Acesso de caixa necessário." }, { status: 403 });
  try {
    const body = bodySchema.parse(await request.json());
    return Response.json(await closeTable(body.tableNumber, body.payments));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." }, { status: 400 });
  }
}
