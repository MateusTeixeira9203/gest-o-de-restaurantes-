import { z } from "zod";
import { createDiningTables } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function POST(request: Request) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const body = z.object({ number: z.number().int().positive().max(200).optional(), start: z.number().int().positive().max(200).optional(), end: z.number().int().positive().max(200).optional(), label: z.string().trim().max(80).optional() }).parse(await request.json());
    const numbers = body.number ? [body.number] : body.start && body.end && body.end >= body.start && body.end - body.start < 100 ? Array.from({ length: body.end - body.start + 1 }, (_, index) => body.start! + index) : [];
    const result = await createDiningTables({ numbers, labels: body.number && body.label ? { [body.number]: body.label } : undefined });
    return Response.json(result, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar as mesas." }, { status: 400 }); }
}
