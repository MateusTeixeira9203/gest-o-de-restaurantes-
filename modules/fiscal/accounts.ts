import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query } from "@/lib/database";
import { authorize, type Actor } from "@/modules/integrations/contracts";
import { periodSchema } from "@/modules/finance/schema";
import { environmentSchema, optionsSchema } from "./schema";
import { focusAvailability, prepareDocument, queueDocument } from "./service";

export const accountKey = z.string().regex(/^(group|order):[0-9a-f-]{36}$/).refine(v => z.string().uuid().safeParse(v.split(":")[1]).success);
export const accountsFilter = z.object({
  from: z.string(), to: z.string(), environment: environmentSchema.default("homologation"),
  search: z.string().trim().max(100).default(""),
  status: z.enum(["pending", "issued", "problem", "all"]).default("pending"),
  page: z.coerce.number().int().min(1).max(100).default(1),
}).refine(v => periodSchema.safeParse(v).success, "Período inválido");
export const accountBatch = z.object({
  environment: environmentSchema,
  action: z.enum(["issue", "validate"]),
  accounts: z.array(z.object({ key: accountKey, options: optionsSchema.optional() })).min(1).max(20),
}).refine(v => new Set(v.accounts.map(a => a.key)).size === v.accounts.length, "Conta repetida")
  .refine(v => v.accounts.length === 1 || v.accounts.every(a => !a.options), "Identifique o consumidor em cada conta individualmente");
export type AccountDocument = { id: string; status: string; blockers: string[]; number?: string; orderIds?: string[]; cancellationStatus?: string };
export type FiscalAccount = {
  key: string; number: string; label: string; total: number; closedAt: string; orders: string[];
  documents: AccountDocument[]; issue?: string; status: "pending" | "issued" | "problem" | "cancelled" | "processing";
};
const accountExpression = "CASE WHEN o.checkout_group_id IS NULL THEN 'order:'||o.id::text ELSE 'group:'||o.checkout_group_id::text END";
export async function listAccounts(rid: string, input: z.infer<typeof accountsFilter>) {
  const rows = (await query(`WITH accounts AS (
    SELECT ${accountExpression} AS key,bool_and(o.status IN ('completed','delivered')) AS closed,min(o.order_number)::text AS number,
      COALESCE(max(t.label), CASE WHEN max(o.fulfillment::text)='delivery' THEN 'Entrega' ELSE 'Retirada' END) AS label,
      sum(o.total_cents)::bigint AS total,array_agg(o.id ORDER BY o.id) AS ids,
      array_agg(o.order_number::text ORDER BY o.order_number) AS orders,
      max(COALESCE(p.paid_at,o.delivered_at,o.collected_at,o.created_at)) AS closed_at
    FROM orders o LEFT JOIN dining_tables t ON t.id=o.table_id AND t.restaurant_id=o.restaurant_id
    LEFT JOIN LATERAL (SELECT max(paid_at) AS paid_at FROM payments WHERE order_id=o.id) p ON true
    WHERE o.restaurant_id=$1
    GROUP BY ${accountExpression}
    HAVING bool_and(o.status IN ('completed','delivered')) OR bool_or(EXISTS (SELECT 1 FROM fiscal_order_links existing WHERE existing.restaurant_id=$1 AND existing.environment=$4 AND existing.order_id=o.id))
  ) SELECT a.*,COALESCE((SELECT json_agg(json_build_object('id',d.id,'status',
      CASE WHEN co.status='succeeded' THEN 'cancelled' ELSE COALESCE(io.status,'draft') END,
      'orderIds',d.order_ids,'blockers',d.blockers,'number',io.result->'fiscal'->>'number','cancellationStatus',co.status))
    FROM fiscal_documents d LEFT JOIN integration_operations io ON io.id=d.operation_id AND io.restaurant_id=$1
    LEFT JOIN integration_operations co ON co.restaurant_id=$1 AND co.environment=$4 AND co.kind='fiscal' AND co.operation_key='fiscal_cancel:'||d.id::text
    WHERE d.restaurant_id=$1 AND d.environment=$4 AND EXISTS(SELECT 1 FROM fiscal_order_links l WHERE l.restaurant_id=$1 AND l.environment=$4 AND l.document_id=d.id AND l.order_id=ANY(a.ids))), '[]') AS documents
    FROM accounts a WHERE (a.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
    ORDER BY a.closed_at DESC,a.key LIMIT 1001`, [rid, input.from, input.to, input.environment])).rows;
  if (rows.length > 1000) throw new Error("Mais de 1.000 contas no período. Escolha um intervalo menor.");
  const accounts: FiscalAccount[] = rows.map(r => {
    const docs = r.documents as AccountDocument[];
    const covered = new Set(docs.flatMap(d => d.orderIds || []));
    const incomplete = docs.length > 0 && (covered.size !== r.ids.length || r.ids.some((id: string) => !covered.has(id)));
    const issue = !r.closed ? "Esta conta foi alterada ou reaberta. Confira os documentos já vinculados." : incomplete ? "Esta conta possui documentos anteriores que cobrem apenas parte dos pedidos. Solicite revisão à gestão." : undefined;
    const mixedCancellation = docs.some(d => d.status === "cancelled") && !docs.every(d => d.status === "cancelled");
    const status = issue || mixedCancellation || docs.some(d => d.status === "failed" || d.blockers.length || (d.cancellationStatus && d.cancellationStatus !== "succeeded")) ? "problem"
      : docs.some(d => ["prepared", "dispatching", "unknown", "pending"].includes(d.status)) ? "processing"
      : docs.length && docs.every(d => d.status === "succeeded") ? "issued"
      : docs.length && docs.every(d => d.status === "cancelled") ? "cancelled" : "pending";
    return { key: r.key, number: r.number, label: r.label, total: Number(r.total), closedAt: r.closed_at.toISOString(), orders: r.orders, documents: docs, issue, status };
  });
  const search = input.search.toLocaleLowerCase("pt-BR");
  const searched = accounts.filter(a => !search || `${a.label} ${a.number} ${a.orders.join(" ")} ${a.documents.map(d => d.number || "").join(" ")}`.toLocaleLowerCase("pt-BR").includes(search));
  const counts = { pending: searched.filter(a => ["pending", "processing"].includes(a.status)).length, issued: searched.filter(a => a.status === "issued").length, problem: searched.filter(a => a.status === "problem").length, all: searched.length };
  const filtered = searched.filter(a => input.status === "all" || (input.status === "pending" ? ["pending", "processing"].includes(a.status) : a.status === input.status));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const page = Math.min(input.page, pages);
  return { accounts: filtered.slice((page - 1) * 50, page * 50), counts, page, pages, total: filtered.length, environment: input.environment, enabled: focusAvailability(rid, input.environment).enabled };
}
export async function submitAccounts(rid: string, raw: z.infer<typeof accountBatch>, actor: Actor) {
  authorize("fiscal", actor);
  const input = accountBatch.parse(raw);
  const results: Array<{ key: string; documentId?: string; status: string; message: string }> = [];
  for (const account of input.accounts) {
    try {
      const [kind, id] = account.key.split(":");
      const orders = (await query(`SELECT id,status FROM orders WHERE restaurant_id=$1 AND ${kind === "group" ? "checkout_group_id" : "id"}=$2 ORDER BY id`, [rid, id])).rows;
      if (!orders.length || orders.some(o => !["completed", "delivered"].includes(o.status))) throw new Error("Conta não encontrada ou ainda não concluída.");
      if (orders.length > 50) throw new Error("Conta com mais de 50 pedidos. Solicite revisão à gestão.");
      // An order key must never be used to invoice only part of a grouped account.
      if (kind === "order" && (await query("SELECT checkout_group_id FROM orders WHERE restaurant_id=$1 AND id=$2", [rid, id])).rows[0]?.checkout_group_id) throw new Error("Use a conta completa, não um pedido isolado.");
      const doc = await prepareDocument(rid, orders.map(o => o.id), randomUUID(), actor, input.environment, account.options ?? optionsSchema.parse({}), true);
      const current = (await query(`SELECT d.options,d.blockers,d.operation_id,io.status,io.result,
        EXISTS(SELECT 1 FROM integration_operations co WHERE co.restaurant_id=$1 AND co.environment=$3 AND co.operation_key='fiscal_cancel:'||d.id::text AND co.status='succeeded') AS cancelled
        FROM fiscal_documents d LEFT JOIN integration_operations io ON io.id=d.operation_id AND io.restaurant_id=d.restaurant_id WHERE d.restaurant_id=$1 AND d.id=$2`, [rid, doc.id, input.environment])).rows[0];
      if (current.cancelled || current.status === "succeeded") {
        results.push({ key: account.key, documentId: doc.id, status: current.cancelled ? "cancelled" : "succeeded", message: "Documento já existente; nenhuma nova emissão criada." }); continue;
      }
      if (account.options && JSON.stringify(optionsSchema.parse(current.options)) !== JSON.stringify(account.options)) throw new Error("Esta conta já foi conferida com outros dados. Corrija a identificação em Ver detalhes.");
      if (current.blockers.length || current.status === "failed") {
        results.push({ key: account.key, documentId: doc.id, status: "problem", message: current.blockers[0] || current.result?.message || "Revalide o documento antes de tentar novamente." }); continue;
      }
      if (input.action === "validate") {
        results.push({ key: account.key, documentId: doc.id, status: "validated", message: "Conferência concluída. Nenhuma nota enviada." }); continue;
      }
      if (!focusAvailability(rid, input.environment).enabled) {
        results.push({ key: account.key, documentId: doc.id, status: "blocked", message: "Conexão fiscal não habilitada. Nenhuma nota enviada." }); continue;
      }
      await queueDocument(rid, doc.id, actor);
      results.push({ key: account.key, documentId: doc.id, status: "queued", message: "Emissão registrada. Aguardando autorização." });
    } catch (error) {
      results.push({ key: account.key, status: "problem", message: error instanceof Error ? error.message : "Não foi possível conferir esta conta." });
    }
  }
  return { results };
}
