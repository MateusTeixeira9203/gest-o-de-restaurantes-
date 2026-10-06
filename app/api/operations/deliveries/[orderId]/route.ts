import { z } from "zod";
import { updateDeliveryStatus } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const bodySchema = z.object({ status: z.enum(["out_for_delivery", "delivered"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!hasStaffSession(request, ["delivery", "cashier", "manager"])) return Response.json({ error: "Acesso de entregas necessário." }, { status: 403 });
  try {
    const actor = sessionFromRequest(request);
    if (!actor) return Response.json({ error: "Sessão expirada." }, { status: 401 });
    const { orderId } = await params;
    const { status } = bodySchema.parse(await request.json());
    return Response.json(await updateDeliveryStatus(orderId, status, { role: actor.role, name: actor.username }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a entrega." }, { status: 400 });
  }
}
