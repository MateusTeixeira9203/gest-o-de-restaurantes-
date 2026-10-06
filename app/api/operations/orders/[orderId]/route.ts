import { cancelOrder } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!hasStaffSession(request, ["waiter", "manager"])) return Response.json({ error: "Acesso de garçom necessário." }, { status: 403 });
  try {
    const { orderId } = await params;
    return Response.json(await cancelOrder(orderId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cancelar." }, { status: 400 });
  }
}
