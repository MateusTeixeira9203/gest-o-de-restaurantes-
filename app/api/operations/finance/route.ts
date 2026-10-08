import { requireProfessional } from "@/modules/tenancy/context";
import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { commandSchema, periodSchema } from "@/modules/finance/schema";
import { financeCommand, businessDate } from "@/modules/finance/service";
import { financialSnapshot } from "@/modules/finance/read-model";
export async function GET(request: Request) {
  const actor = await sessionFromRequest(request);
  if (!actor || !["admin", "manager", "cashier"].includes(actor.role))
    return Response.json(
      { error: "Acesso financeiro necessário." },
      { status: 403 },
    );
  try {
    const url = new URL(request.url);
    const cashOnly =
      actor.role === "cashier" || url.searchParams.get("cash") === "1";
    if (!cashOnly) await requireProfessional();
    const period = periodSchema.parse({
      from: url.searchParams.get("from") || businessDate(),
      to: url.searchParams.get("to") || businessDate(),
    });
    const data = await financialSnapshot(period.from, period.to);
    return Response.json(
      cashOnly ? { today: data.today, shifts: data.shifts } : data,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar financeiro.",
      },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const actor = await sessionFromRequest(request);
  if (!actor || !["admin", "manager", "cashier"].includes(actor.role))
    return Response.json(
      { error: "Acesso financeiro necessário." },
      { status: 403 },
    );
  try {
    const command = commandSchema.parse(await request.json());
    if (!["open_shift", "close_shift", "cash_move"].includes(command.action))
      await requireProfessional();
    const key = z.string().uuid().parse(request.headers.get("idempotency-key"));
    return Response.json(
      await financeCommand(command, key, {
        name: actor.username,
        role: actor.role,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Confira os campos e valores informados."
            : error instanceof Error
              ? error.message
              : "Falha financeira.",
      },
      { status: 400 },
    );
  }
}
