import { z } from "zod";
import { updateKitchenTicket } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ status: z.enum(["preparing", "ready"]) });

function hasInternalAccess(request: Request) {
  const secret = process.env.RESTAURANT_INTERNAL_API_KEY;
  return hasStaffSession(request) || Boolean(secret && request.headers.get("x-restaurant-internal-key") === secret);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  if (!hasInternalAccess(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { ticketId } = await params;
    const { status } = bodySchema.parse(await request.json());
    return Response.json(await updateKitchenTicket(ticketId, status), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o pedido.";
    return Response.json({ error: message }, { status: 400 });
  }
}
