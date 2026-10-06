import { z } from "zod";
import { createDiningTable } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try { return Response.json(await createDiningTable(z.object({ number: z.number().int().positive().max(200) }).parse(await request.json()).number), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? "Mesa já cadastrada ou inválida." : "Não foi possível criar a mesa." }, { status: 400 }); }
}
