import { z } from "zod";
import { createOrder } from "@/lib/restaurant-repository";

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  addonIds: z.array(z.string().uuid()).max(12).optional(),
  note: z.string().trim().max(280).optional(),
});

const orderSchema = z.object({
  source: z.enum(["public_menu", "qr_menu"]),
  fulfillment: z.enum(["dine_in", "pickup", "delivery"]),
  tableNumber: z.number().int().positive().max(200).optional(),
  customer: z.object({ name: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().min(8).max(24).optional() }).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(itemSchema).min(1).max(40),
  delivery: z.object({
    addressLine1: z.string().trim().min(4).max(180),
    addressLine2: z.string().trim().max(120).optional(),
    neighborhood: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(40).optional(),
    postalCode: z.string().trim().max(16).optional(),
    reference: z.string().trim().max(180).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.fulfillment === "dine_in" && !value.tableNumber) context.addIssue({ code: "custom", path: ["tableNumber"], message: "Informe a mesa." });
  if (value.fulfillment === "delivery" && !value.delivery) context.addIssue({ code: "custom", path: ["delivery"], message: "Informe o endereço de entrega." });
});

export async function POST(request: Request) {
  try {
    const payload = orderSchema.parse(await request.json());
    const order = await createOrder(payload);
    return Response.json({ order }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Dados do pedido inválidos.", details: error.flatten() }, { status: 400 });
    const message = error instanceof Error ? error.message : "Não foi possível registrar o pedido.";
    return Response.json({ error: message }, { status: 400 });
  }
}
