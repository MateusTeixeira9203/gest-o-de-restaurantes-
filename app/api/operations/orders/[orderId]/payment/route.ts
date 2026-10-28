import { z } from "zod";
import { recordExternalPayment } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await hasStaffSession(request, ["cashier", "delivery", "manager"]))) return Response.json({ error: "Acesso de caixa ou entrega necessário." }, { status: 403 });
  try {
    const { method, receivedCents } = z.object({ method: z.enum(["Pix", "Dinheiro", "Débito", "Crédito"]), receivedCents: z.number().int().optional() }).parse(await request.json());
    const actor = (await sessionFromRequest(request))!;
    return Response.json(await recordExternalPayment((await params).orderId, method, { role: actor.role, name: actor.username }, receivedCents));
  } catch (error) {
    const message = error instanceof z.ZodError && error.issues.some(issue => issue.path[0] === "receivedCents")
      ? "Informe um valor entregue valido"
      : error instanceof Error ? error.message : "Não foi possível registrar o pagamento.";
    return Response.json({ error: message }, { status: 400 });
  }
}
