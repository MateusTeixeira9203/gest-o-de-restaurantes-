import { cancelOrder } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try {
    const { orderId } = await params;
    return Response.json(await cancelOrder(orderId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cancelar." }, { status: 400 });
  }
}
