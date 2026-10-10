import { requireProfessional } from "@/modules/tenancy/context";
import { sessionFromRequest } from "@/lib/staff-session";
import { periodSchema } from "@/modules/finance/schema";
import { financeExport } from "@/modules/finance/read-model";
export async function GET(request: Request) {
  const actor = await sessionFromRequest(request);
  if (!actor || !["admin", "manager"].includes(actor.role))
    return Response.json(
      { error: "Acesso de gestão necessário." },
      { status: 403 },
    );
  try {
    await requireProfessional();
    const url = new URL(request.url);
    const p = periodSchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return new Response(await financeExport(p.from, p.to), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="restio-financeiro-${p.from}-${p.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Período inválido ou exportação indisponível." },
      { status: 400 },
    );
  }
}
