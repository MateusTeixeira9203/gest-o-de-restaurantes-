import { z } from "zod";
import { createStaffMember, listStaffMembers } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const roleSchema = z.enum(["manager", "waiter", "kitchen", "cashier"]);
const createSchema = z.object({ name: z.string().trim().min(2).max(80), role: roleSchema, pin: z.string().regex(/^\d{4,6}$/, "O PIN precisa ter de 4 a 6 números.") });

export async function GET(request: Request) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  return Response.json({ team: await listStaffMembers() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    return Response.json({ member: await createStaffMember(createSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a pessoa." }, { status: 400 });
  }
}
