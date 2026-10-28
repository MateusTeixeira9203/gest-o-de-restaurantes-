import { z } from "zod";
import { updateRestaurantSettings } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ name: z.string().trim().min(2).max(100), whatsapp: z.string().trim().max(24), serviceRate: z.number().min(0).max(100), defaultDeliveryFeeCents: z.number().int().min(0).max(20000, "A taxa de entrega pode ser de no máximo R$ 200,00.").optional() });

export async function PATCH(request: Request) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    return Response.json(await updateRestaurantSettings(bodySchema.parse(await request.json())));
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : "Não foi possível salvar as configurações." }, { status: 400 });
  }
}
