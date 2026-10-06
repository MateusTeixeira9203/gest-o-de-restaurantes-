import { z } from "zod";
import { setProductAvailability } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ available: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try {
    const { productId } = await params;
    return Response.json(await setProductAvailability(productId, bodySchema.parse(await request.json()).available));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o produto." }, { status: 400 });
  }
}
