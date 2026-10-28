import { z } from "zod";
import { query } from "@/lib/database";
import { sessionFromRequest } from "@/lib/staff-session";
import { restaurantContext } from "@/modules/tenancy/context";
export async function GET(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s)
    return Response.json({ error: "Acesso necessário." }, { status: 401 });
  const r = await restaurantContext();
  return Response.json(
    {
      name: "Restrio",
      restaurant: r.name,
      plan: r.plan,
      status: r.product_status,
      accentColor: r.accent_color,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PATCH(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager"].includes(s.role))
    return Response.json(
      { error: "Acesso de gestão necessário." },
      { status: 403 },
    );
  try {
    const body = z
      .object({
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        plan: z.enum(["essential", "professional"]).optional(),
      })
      .parse(await request.json());
    if (body.plan && s.role !== "admin")
      return Response.json(
        { error: "Somente o administrador da plataforma altera o plano." },
        { status: 403 },
      );
    const r = await restaurantContext();
    await query(
      "UPDATE restaurants SET accent_color=$2,plan=COALESCE($3,plan),updated_at=now() WHERE id=$1",
      [r.id, body.accentColor, body.plan ?? null],
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Configuração inválida." }, { status: 400 });
  }
}
