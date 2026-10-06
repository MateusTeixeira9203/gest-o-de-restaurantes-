import { z } from "zod";
import { createInventoryItem, registerInventoryMovement } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const itemSchema = z.object({ name: z.string().trim().min(2).max(100), category: z.string().trim().max(50).optional(), unit: z.enum(["un", "g", "kg", "ml", "L"]), quantity: z.number().nonnegative().optional(), minimumQuantity: z.number().nonnegative().optional(), unitCostCents: z.number().nonnegative().optional() });
const movementSchema = z.object({ itemId: z.string().uuid(), type: z.enum(["purchase", "loss", "adjustment"]), quantity: z.number().finite(), unitCostCents: z.number().nonnegative().optional(), note: z.string().trim().max(240).optional() });

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string };
    const result = body.action === "movement" ? await registerInventoryMovement(movementSchema.parse(body)) : await createInventoryItem(itemSchema.parse(body));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o estoque." }, { status: 400 });
  }
}
