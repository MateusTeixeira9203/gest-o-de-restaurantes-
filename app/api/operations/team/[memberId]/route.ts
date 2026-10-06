import { z } from "zod";
import { updateStaffMember } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["manager", "waiter", "kitchen", "cashier", "delivery"]).optional(),
  pin: z.string().regex(/^\d{4,6}$/, "O PIN precisa ter de 4 a 6 números.").optional(),
  active: z.boolean().optional(),
}).refine(value => Object.keys(value).length > 0, "Informe uma alteração.");

export async function PATCH(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const { memberId } = await params;
    return Response.json({ member: await updateStaffMember(memberId, schema.parse(await request.json())) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a pessoa." }, { status: 400 });
  }
}
