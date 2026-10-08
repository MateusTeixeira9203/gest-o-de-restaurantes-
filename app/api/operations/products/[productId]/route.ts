import { z } from "zod";
import { setProductAvailability, updateMenuProduct } from "@/lib/restaurant-repository";
import { menuProductSchema } from "@/lib/menu-product-schema";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ available: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const { productId } = await params;
    const body: Record<string, unknown> = await request.json();
    if (body && Object.keys(body).length === 1 && typeof body.available === "boolean") return Response.json(await setProductAvailability(productId, bodySchema.parse(body).available));
    return Response.json(await updateMenuProduct(productId, menuProductSchema.parse(body)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o produto." }, { status: 400 });
  }
}
