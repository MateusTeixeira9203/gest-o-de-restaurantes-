import { getOperationSnapshot } from "@/lib/restaurant-repository";
import { sessionFromRequest } from "@/lib/staff-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try {
    const snapshot = await getOperationSnapshot();
    if (session.role === "admin" || session.role === "manager") {
      return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
    }

    const noInventory = { enabled: false, items: [], movements: [], recipes: [] };
    const ordersWithoutAddresses = snapshot.orders.map(order => ({ ...order, delivery: null }));
    const privateOrders = ordersWithoutAddresses.map(order => ({...order, expectedPaymentMethod: null, cashTenderedCents: null, changeCents: null}));
    const kitchenOrders = privateOrders
      .filter(order => ["confirmed", "preparing", "ready"].includes(order.status))
      .map(order => ({ ...order, customerPhone: null, payments: [], paidCents: 0 }));
    const kitchenOrderIds = new Set(kitchenOrders.map(order => order.id));
    const roleSnapshot = session.role === "kitchen"
      ? { ...snapshot, tables: [], orders: kitchenOrders, kitchen: snapshot.kitchen.filter(ticket => kitchenOrderIds.has(ticket.orderId)), inventory: noInventory }
      : session.role === "waiter"
        ? { ...snapshot, orders: privateOrders.filter(order => order.fulfillment === "dine_in" || order.status === "pending"), kitchen: [], inventory: noInventory }
        : session.role === "delivery"
          ? { ...snapshot, products: [], tables: [], orders: snapshot.orders.filter(order => order.fulfillment === "delivery" && !["pending", "cancelled"].includes(order.status)), kitchen: [], inventory: noInventory }
          : { ...snapshot, orders: ordersWithoutAddresses, kitchen: [], inventory: noInventory };
    return Response.json(roleSnapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível carregar a operação." }, { status: 503 });
  }
}
