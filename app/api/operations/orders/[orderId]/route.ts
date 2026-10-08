import { cancelOrder } from "@/lib/restaurant-repository";
import { z } from "zod";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const bodySchema = z.object({ reason: z.string().trim().max(160).optional().default("Cancelamento confirmado") });

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await hasStaffSession(request, ["waiter", "cashier", "manager"]))) return Response.json({ error: "Acesso operacional necessário." }, { status: 403 });
  try {
    const { orderId } = await params;
    const actor = await sessionFromRequest(request);
    if (!actor) return Response.json({ error: "Sessão expirada." }, { status: 401 });
    return Response.json(await cancelOrder(orderId, { role: actor.role, name: actor.username, reason: bodySchema.parse(await request.json()).reason }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cancelar." }, { status: 400 });
  }
}
