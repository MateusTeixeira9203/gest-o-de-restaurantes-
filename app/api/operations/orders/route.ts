import { z } from "zod";
import { createOrder } from "@/lib/restaurant-repository";
import { hasStaffSession, sessionFromRequest } from "@/lib/staff-session";

const itemSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50), addonIds: z.array(z.string().uuid()).max(12).refine(ids=>new Set(ids).size===ids.length,"Adicional repetido.").optional(), note: z.string().trim().max(280).optional() });
const common = {
  items: z.array(itemSchema).min(1).max(40), sendToKitchen: z.literal(true),
  notes: z.string().trim().max(500).optional(),
};
const name = z.string({required_error: "Informe o nome do cliente."}).trim().min(2, "Informe o nome do cliente.").max(100);
const phone = z.string({required_error: "Informe o telefone para entrega."}).trim().min(8, "Informe o telefone para entrega.").max(24);
const deliverySchema = z.object({
  addressLine1: z.string({required_error: "Informe o endereço de entrega."}).trim().min(4, "Informe o endereço de entrega.").max(180),
  addressLine2: z.string().trim().max(120).optional(), neighborhood: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(), state: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(16).optional(), reference: z.string().trim().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
}, {required_error: "Informe o endereço de entrega."});
const bodySchema = z.discriminatedUnion("fulfillment", [
  z.object({...common, fulfillment: z.literal("dine_in"), tableNumber: z.number({required_error: "Informe a mesa."}).int().min(1).max(200),
    customer: z.object({name: name.optional(), phone: phone.optional()}).optional()}),
  z.object({...common, fulfillment: z.literal("pickup"), customer: z.object({name, phone: phone.optional()}, {required_error: "Informe o nome do cliente."})}),
  z.object({...common, fulfillment: z.literal("delivery"), customer: z.object({name, phone}, {required_error: "Informe o nome do cliente."}), delivery: deliverySchema,
    deliveryFeeCents: z.number().int().min(0).max(20000, "A taxa de entrega pode ser de no máximo R$ 200,00.").optional(),
    expectedPaymentMethod: z.enum(["pix", "cash", "debit", "credit", "prepaid"], {required_error: "Escolha como o cliente vai pagar."}),
    cashTenderedCents: z.number().int().min(0).max(1000000, "O valor para troco pode ser de no máximo R$ 10.000,00.").optional(),
  }),
]).superRefine((value, context) => {
  if (value.fulfillment === "delivery" && value.cashTenderedCents !== undefined && value.expectedPaymentMethod !== "cash")
    context.addIssue({code: "custom", path: ["cashTenderedCents"], message: "Troco só para pagamento em dinheiro."});
});

export async function POST(request: Request) {
  if (!(await hasStaffSession(request, ["waiter", "cashier", "manager"]))) return Response.json({ error: "Acesso de garçom necessário." }, { status: 403 });
  try {
    const actor = (await sessionFromRequest(request))!;
    const idempotencyKey = z.string().uuid().parse(request.headers.get("idempotency-key"));
    const body = bodySchema.parse({fulfillment: "dine_in", ...z.record(z.unknown()).parse(await request.json())});
    return Response.json({ order: await createOrder({ ...body, source: "waiter" }, { idempotencyKey, sendToKitchen: true, actor: { role: actor.role, name: actor.username, staffId: actor.staffId } }) }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0].message
      : error && typeof error === "object" && "code" in error && error.code === "22003" ? "Valor fora do limite."
      : error instanceof Error ? error.message : "Não foi possível criar o pedido.";
    return Response.json({ error: message }, { status: 400 });
  }
}
