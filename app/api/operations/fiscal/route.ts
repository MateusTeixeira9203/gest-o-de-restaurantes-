import { collectFiles } from "@/modules/fiscal/resources";
import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { requireProfessional } from "@/modules/tenancy/context";
import { fiscalCommand, environmentSchema } from "@/modules/fiscal/schema";
import {
  fiscalOverview,
  saveIssuer,
  saveTax,
  prepareDocument,
  refreshDocument,
  processDocument,
  cancelDocument,
} from "@/modules/fiscal/service";
export const maxDuration = 120;
export async function GET(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager", "cashier"].includes(s.role))
    return Response.json(
      { error: "Acesso fiscal necessário." },
      { status: 403 },
    );
  try {
    await requireProfessional();
    return Response.json(
      await fiscalOverview(
        s.restaurantId,
        environmentSchema.parse(
          new URL(request.url).searchParams.get("environment") ||
            "homologation",
        ),
        new URL(request.url).searchParams.get("documents")
          ? z.array(z.string().uuid()).max(50).parse(new URL(request.url).searchParams.get("documents")!.split(","))
          : undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "Não foi possível abrir o fiscal. Confira plano e configuração.",
      },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager", "cashier"].includes(s.role))
    return Response.json(
      { error: "Acesso fiscal necessário." },
      { status: 403 },
    );
  try {
    await requireProfessional();
    const command = fiscalCommand.parse(await request.json());
    const actor = { name: s.username, role: s.role };
    if (
      ["issuer", "product"].includes(command.action) &&
      !["admin", "manager"].includes(s.role)
    )
      return Response.json(
        { error: "Somente gestão altera o cadastro fiscal." },
        { status: 403 },
      );
    let data;
    switch (command.action) {
      case "issuer":
        data = await saveIssuer(s.restaurantId, command.data, actor);
        break;
      case "product":
        data = await saveTax(
          s.restaurantId,
          command.productId,
          command.data,
          actor,
        );
        break;
      case "prepare":
        data = await prepareDocument(
          s.restaurantId,
          command.orderIds,
          z.string().uuid().parse(request.headers.get("idempotency-key")),
          actor,
          command.environment,
          command.options,
        );
        break;
      case "refresh":
        data = await refreshDocument(
          s.restaurantId,
          command.documentId,
          actor,
          command.options,
        );
        break;
      case "cancel":
        data = await cancelDocument(
          s.restaurantId,
          command.documentId,
          command.reason,
          actor,
        );
        break;
      case "files":
        data = await collectFiles(s.restaurantId, command.documentId);
        break;
      case "process":
        data = await processDocument(s.restaurantId, command.documentId, actor);
        break;
      default:
        throw new Error("Ação indisponível.");
    }
    return Response.json(data);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Dados fiscais inválidos."
            : e instanceof Error
              ? e.message
              : "Não foi possível concluir.",
      },
      { status: 400 },
    );
  }
}
