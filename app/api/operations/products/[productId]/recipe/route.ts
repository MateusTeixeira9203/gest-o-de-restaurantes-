import { z } from "zod";
import { replaceVariantRecipe } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const schema = z.object({ variantId: z.string().uuid(), components: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().positive() })).max(60) });

export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try {
    await params;
    return Response.json(await replaceVariantRecipe(schema.parse(await request.json())));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a ficha técnica." }, { status: 400 });
  }
}
