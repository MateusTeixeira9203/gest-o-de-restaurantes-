import { z } from "zod";
import { createOrder } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const itemSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50), addonIds: z.array(z.string().uuid()).max(12).optional(), note: z.string().trim().max(280).optional() });
const bodySchema = z.object({ tableNumber: z.number().int().positive().max(200), items: z.array(itemSchema).min(1).max(40), sendToKitchen: z.literal(true), notes: z.string().trim().max(500).optional() });

export async function POST(request: Request) {
  if (!(await hasStaffSession(request, ["waiter", "cashier", "manager"]))) return Response.json({ error: "Acesso de garçom necessário." }, { status: 403 });
  try {
    const actor = (await sessionFromRequest(request))!;
    const idempotencyKey = z.string().uuid().parse(request.headers.get("idempotency-key"));
    const body = bodySchema.parse(await request.json());
    return Response.json({ order: await createOrder({ source: "waiter", fulfillment: "dine_in", tableNumber: body.tableNumber, items: body.items, notes: body.notes }, { idempotencyKey, sendToKitchen: true, actor: { role: actor.role, name: actor.username, staffId: actor.staffId } }) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o pedido.";
    return Response.json({ error: message }, { status: 400 });
  }
}
