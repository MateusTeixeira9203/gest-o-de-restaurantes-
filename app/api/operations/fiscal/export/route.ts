import { sessionFromRequest } from "@/lib/staff-session";
import { requireProfessional } from "@/modules/tenancy/context";
import { transaction } from "@/lib/database";
import { periodSchema } from "@/modules/finance/schema";
import { environmentSchema } from "@/modules/fiscal/schema";
import { exportFiscal } from "@/modules/fiscal/export";
export async function GET(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager", "cashier"].includes(s.role))
    return Response.json(
      { error: "Acesso fiscal necessário." },
      { status: 403 },
    );
  try {
    await requireProfessional();
    const url = new URL(request.url);
    const period = periodSchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const environment = environmentSchema.parse(
      url.searchParams.get("environment") || "homologation",
    );
    const bytes = await transaction(async (c) => {
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      return exportFiscal(c, s.restaurantId, environment, period, s.username);
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="fiscal-${environment === "homologation" ? "homologacao" : "producao"}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha na exportação." },
      { status: 400 },
    );
  }
}
