import { z } from "zod";
import { setProductAvailability } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ available: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const { productId } = await params;
    return Response.json(await setProductAvailability(productId, bodySchema.parse(await request.json()).available));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o produto." }, { status: 400 });
  }
}
