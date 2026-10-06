import { z } from "zod";
import { setInventoryEnabled } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try { return Response.json(await setInventoryEnabled(schema.parse(await request.json()).enabled)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a opção." }, { status: 400 }); }
}
