import { z } from "zod";
import { updateDiningTable } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function PATCH(request: Request, { params }: { params: Promise<{ number: string }> }) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const number = Number((await params).number);
    if (!Number.isInteger(number) || number < 1 || number > 200) throw new Error("Mesa inválida.");
    const { label, active } = z.object({ label: z.string().trim().min(2).max(80), active: z.boolean() }).parse(await request.json());
    return Response.json(await updateDiningTable(number, label, active));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a mesa." }, { status: 400 }); }
}
