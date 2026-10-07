import { createMenuProduct } from "@/lib/restaurant-repository";
import { menuProductSchema } from "@/lib/menu-product-schema";
import { hasStaffSession } from "@/lib/staff-session";

export async function POST(request: Request) {
  if (!hasStaffSession(request, ["manager"])) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try { return Response.json(await createMenuProduct(menuProductSchema.parse(await request.json())), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar o produto." }, { status: 400 }); }
}
