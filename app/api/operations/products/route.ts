import { z } from "zod";
import { createMenuProduct } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

const bodySchema = z.object({ name: z.string().trim().min(2).max(100), category: z.string().trim().min(2).max(50), sector: z.string().trim().min(2).max(50), priceCents: z.number().int().min(0), description: z.string().trim().max(240).optional() });

export async function POST(request: Request) {
  if (!hasStaffSession(request)) return Response.json({ error: "Acesso da equipe necessário." }, { status: 401 });
  try { return Response.json(await createMenuProduct(bodySchema.parse(await request.json())), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar o produto." }, { status: 400 }); }
}
