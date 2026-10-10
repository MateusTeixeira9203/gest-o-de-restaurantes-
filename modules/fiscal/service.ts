import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction, database } from "@/lib/database";
import { emptyIssuer, issuerSchema, taxSchema, optionsSchema } from "./schema";
import type { Issuer, Tax, FiscalOptions } from "./schema";
import { buildFiscal } from "./builder";
import type { Sale, SaleItem, Receipt } from "./builder";
import { prepare, dispatch } from "@/modules/integrations/queue";
import { focusProvider } from "./focus";
import type {
  Actor,
  Operation,
  Environment,
} from "@/modules/integrations/contracts";
import { focusAvailability } from "./config";
export { focusAvailability } from "./config";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type Snapshot = ReturnType<typeof buildFiscal>;
async function event(
  c: PoolClient,
  rid: string,
  actor: Actor,
  action: string,
  id?: string,
  detail: unknown = {},
) {
  await c.query(
    "INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)",
    [rid, id || null, actor.name, action, detail],
  );
}
async function lock(c: PoolClient, rid: string) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `fiscal:${rid}`,
  ]);
}
async function build(
  c: PoolClient,
  rid: string,
  ids: string[],
  options?: FiscalOptions,
): Promise<Snapshot> {
  const profile =
    (
      await c.query("SELECT data FROM fiscal_profiles WHERE restaurant_id=$1", [
        rid,
      ])
    ).rows[0]?.data || emptyIssuer;
  const sales = (
    await c.query<Sale>(
      "SELECT id,order_number,source,fulfillment,status,table_id,checkout_group_id,subtotal_cents,service_cents,delivery_fee_cents,total_cents FROM orders WHERE restaurant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE",
      [rid, ids],
    )
  ).rows;
  if (sales.length !== ids.length)
    throw new Error("Venda não encontrada neste restaurante.");
  const items = (
    await c.query<SaleItem>(
      "SELECT i.id,i.order_id,i.product_id,i.product_name,i.variant_name,i.quantity,i.unit_price_cents,i.addons FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.restaurant_id=$1 AND o.id=ANY($2::uuid[]) ORDER BY i.id",
      [rid, ids],
    )
  ).rows;
  const receipts = (
    await c.query<Receipt>(
      "SELECT p.order_id,p.method,p.amount_cents,p.received_cents,p.change_cents FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1 AND o.id=ANY($2::uuid[]) AND p.status='paid' ORDER BY p.id",
      [rid, ids],
    )
  ).rows;
  const profiles = (
    await c.query(
      "SELECT product_id,data FROM fiscal_product_profiles WHERE restaurant_id=$1 ORDER BY product_id",
      [rid],
    )
  ).rows;
  const taxes: Record<string, Tax> = {};
  for (const p of profiles)
    if (items.some((i) => i.product_id === p.product_id))
      taxes[p.product_id] = p.data;
  return buildFiscal(profile, sales, items, receipts, taxes, options);
}
export async function fiscalOverview(
  rid: string,
  environment: Environment = "homologation",
) {
  const [issuer, products, sales, documents] = await Promise.all([
    query("SELECT data FROM fiscal_profiles WHERE restaurant_id=$1", [rid]),
    query(
      "SELECT p.id,p.name,fp.data FROM menu_products p LEFT JOIN fiscal_product_profiles fp ON fp.product_id=p.id AND fp.restaurant_id=p.restaurant_id WHERE p.restaurant_id=$1 ORDER BY p.name",
      [rid],
    ),
    query(
      `SELECT o.id,o.order_number,o.total_cents,o.fulfillment,o.source,o.checkout_group_id,o.created_at,t.label FROM orders o LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.restaurant_id=$1 AND o.status IN ('completed','delivered') AND NOT EXISTS(SELECT 1 FROM fiscal_order_links l WHERE l.restaurant_id=$1 AND l.order_id=o.id AND l.environment=$2) ORDER BY o.created_at DESC LIMIT 200`,
      [rid, environment],
    ),
    query(
      `SELECT d.id,d.environment,d.options,d.issued_at,d.created_at,d.order_ids,d.blockers,d.snapshot->'totalCents' AS total_cents,d.snapshot->'payload'->>'_fiscal_model' AS model,d.snapshot->'sales' AS sales,d.operation_id,
 CASE WHEN co.status='succeeded' THEN 'cancelled' ELSE COALESCE(o.status,'draft') END AS status,o.reference,o.result,co.result AS cancellation_result,co.status AS cancellation_status,co.payload->>'justificativa' AS cancellation_reason,
 COALESCE((SELECT json_agg(json_build_object('id',f.id,'kind',f.kind)) FROM fiscal_files f WHERE f.restaurant_id=$1 AND f.document_id=d.id),'[]') AS files
 FROM fiscal_documents d LEFT JOIN integration_operations o ON o.id=d.operation_id AND o.restaurant_id=d.restaurant_id LEFT JOIN integration_operations co ON co.restaurant_id=d.restaurant_id AND co.operation_key='fiscal_cancel:'||d.id::text AND co.kind='fiscal' AND co.environment=d.environment WHERE d.restaurant_id=$1 AND d.environment=$2 ORDER BY d.created_at DESC LIMIT 200`,
      [rid, environment],
    ),
  ]);
  return {
    issuer: issuerSchema.parse(issuer.rows[0]?.data || emptyIssuer),
    products: products.rows,
    sales: sales.rows,
    documents: documents.rows,
    environment,
    enabled: focusAvailability(rid, environment).enabled,
  };
}
export async function saveIssuer(rid: string, data: Issuer, actor: Actor) {
  const value = issuerSchema.parse(data);
  return transaction(async (c) => {
    await lock(c, rid);
    await c.query(
      "INSERT INTO fiscal_profiles(restaurant_id,data,updated_by) VALUES($1,$2,$3) ON CONFLICT(restaurant_id) DO UPDATE SET data=$2,updated_by=$3,updated_at=now()",
      [rid, value, actor.name],
    );
    await event(c, rid, actor, "issuer_updated");
    return { ok: true };
  });
}
export async function saveTax(
  rid: string,
  productId: string,
  data: Tax,
  actor: Actor,
) {
  const value = taxSchema.parse(data);
  return transaction(async (c) => {
    await lock(c, rid);
    const found = await c.query(
      "SELECT id FROM menu_products WHERE restaurant_id=$1 AND id=$2",
      [rid, productId],
    );
    if (!found.rowCount) throw new Error("Produto não encontrado.");
    await c.query(
      "INSERT INTO fiscal_product_profiles(restaurant_id,product_id,data,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,product_id) DO UPDATE SET data=$3,updated_by=$4,updated_at=now()",
      [rid, productId, value, actor.name],
    );
    await event(c, rid, actor, "tax_updated", undefined, { productId });
    return { ok: true };
  });
}
export async function prepareDocument(
  rid: string,
  ids: string[],
  key: string,
  actor: Actor,
  environment: Environment = "homologation",
  options: FiscalOptions = optionsSchema.parse({}),
) {
  if (new Set(ids).size !== ids.length) throw new Error("Pedido repetido.");
  const sorted = [...ids].sort();
  return transaction(async (c) => {
    await lock(c, rid);
    const prior = (
      await c.query(
        "SELECT id,order_ids,options FROM fiscal_documents WHERE restaurant_id=$1 AND request_key=$2 AND environment=$3",
        [rid, key, environment],
      )
    ).rows[0];
    if (prior) {
      if (
        JSON.stringify(prior.order_ids) !== JSON.stringify(sorted) ||
        digest(optionsSchema.parse(prior.options)) !==
          digest(optionsSchema.parse(options))
      )
        throw new Error("Chave já usada com outras vendas.");
      return { id: prior.id };
    }
    if (
      (
        await c.query(
          "SELECT order_id FROM fiscal_order_links WHERE restaurant_id=$1 AND order_id=ANY($2::uuid[]) AND environment=$3",
          [rid, sorted, environment],
        )
      ).rowCount
    )
      throw new Error(
        "Uma venda selecionada já possui preparação fiscal. Abra o documento existente.",
      );
    const snapshot = await build(c, rid, sorted, options);
    if (
      sorted.length > 1 &&
      snapshot.blockers.some(
        (b) => b.includes("mesmo fechamento") || b.includes("misture canais"),
      )
    )
      throw new Error(
        "Selecione pedidos do mesmo fechamento de conta e canal.",
      );
    const d = (
      await c.query(
        "INSERT INTO fiscal_documents(restaurant_id,request_key,order_ids,snapshot,blockers,created_by,environment,options) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          rid,
          key,
          sorted,
          snapshot,
          JSON.stringify(snapshot.blockers),
          actor.name,
          environment,
          options,
        ],
      )
    ).rows[0];
    for (const id of sorted)
      await c.query(
        "INSERT INTO fiscal_order_links(restaurant_id,order_id,document_id,environment) VALUES($1,$2,$3,$4)",
        [rid, id, d.id, environment],
      );
    await event(c, rid, actor, "prepared", d.id);
    return { id: d.id };
  });
}
export async function refreshDocument(
  rid: string,
  id: string,
  actor: Actor,
  options?: FiscalOptions,
) {
  return transaction(async (c) => {
    await lock(c, rid);
    const d = (
      await c.query(
        "SELECT * FROM fiscal_documents WHERE restaurant_id=$1 AND id=$2 FOR UPDATE",
        [rid, id],
      )
    ).rows[0];
    if (!d) throw new Error("Documento não encontrado.");
    if (d.operation_id) {
      const old = (
        await c.query(
          "SELECT status,result FROM integration_operations WHERE restaurant_id=$1 AND id=$2",
          [rid, d.operation_id],
        )
      ).rows[0];
      if (old?.status !== "failed" || old?.result?.code === "focus_denied")
        throw new Error(
          "Documento em processamento ou autorizado não pode ser alterado.",
        );
      await event(c, rid, actor, "rejected_revision", id, {
        operationId: d.operation_id,
        snapshot: d.snapshot,
      });
    }
    const snapshot = await build(
      c,
      rid,
      d.order_ids,
      options ?? optionsSchema.parse(d.options),
    );
    await c.query(
      "UPDATE fiscal_documents SET snapshot=$3,blockers=$4,operation_id=NULL,options=$5,updated_at=now() WHERE restaurant_id=$1 AND id=$2",
      [
        rid,
        id,
        snapshot,
        JSON.stringify(snapshot.blockers),
        options ?? d.options,
      ],
    );
    await event(c, rid, actor, "refreshed", id);
    return { ok: true };
  });
}
export async function processDocument(rid: string, id: string, actor: Actor) {
  const selected = await transaction(async (c) => {
    await lock(c, rid);
    const d = (
      await c.query(
        "SELECT * FROM fiscal_documents WHERE restaurant_id=$1 AND id=$2 FOR UPDATE",
        [rid, id],
      )
    ).rows[0];
    if (!d) throw new Error("Documento não encontrado.");
    const settings = focusAvailability(rid, d.environment);
    if (!settings.enabled)
      throw new Error(
        "Conector deste ambiente desabilitado. Nenhuma nota foi enviada.",
      );
    if (settings.cnpj && settings.cnpj !== d.snapshot.issuer.cnpj)
      throw new Error("CNPJ do conector diverge do emitente.");
    if (!d.operation_id) {
      const snapshot = await build(
        c,
        rid,
        d.order_ids,
        optionsSchema.parse(d.options),
      );
      if (snapshot.blockers.length)
        throw new Error("Resolva as pendências fiscais antes de transmitir.");
      // JSONB key order is not stable. Compare source financial records canonically through field serialization.
      const fingerprint = (v: Snapshot) =>
        digest(
          JSON.stringify(v, (key, value) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
                )
              : value,
          ),
        );
      if (fingerprint(snapshot) !== fingerprint(d.snapshot))
        throw new Error(
          "A venda ou configuração mudou. Atualize a preparação antes de transmitir.",
        );
      const revision =
        Number(
          (
            await c.query(
              "SELECT count(*) AS n FROM fiscal_events WHERE restaurant_id=$1 AND document_id=$2 AND action='queued'",
              [rid, id],
            )
          ).rows[0].n,
        ) + 1;
      const operation = await prepare(
        c,
        {
          restaurantId: rid,
          environment: d.environment,
          kind: "fiscal",
          provider: "focus",
          key: `fiscal:${id}:${revision}`,
          payload: {
            ...snapshot.payload,
            data_emissao: new Date().toISOString(),
          },
        },
        actor,
      );
      await c.query(
        "UPDATE fiscal_documents SET operation_id=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2",
        [rid, id, operation.id],
      );
      await event(c, rid, actor, "queued", id);
      d.operation_id = operation.id;
    }
    return {
      operationId: d.operation_id,
      issuer: d.snapshot.issuer as Issuer,
      settings,
    };
  });
  const c = await database.connect();
  try {
    const result = await dispatch(
      c,
      rid,
      selected.operationId,
      focusProvider({
        restaurantId: rid,
        issuerCnpj: selected.issuer.cnpj,
        ...selected.settings,
        taxProfileValidated: selected.issuer.reviewed,
      }),
    );
    await recordOutcome(c, rid, id, result, actor);
    return { status: result?.status };
  } finally {
    c.release();
  }
}
export async function fiscalOperation(
  rid: string,
  id: string,
): Promise<Operation> {
  const row = (
    await query<Operation>(
      "SELECT o.* FROM integration_operations o JOIN fiscal_documents d ON d.operation_id=o.id AND d.restaurant_id=o.restaurant_id WHERE d.restaurant_id=$1 AND d.id=$2",
      [rid, id],
    )
  ).rows[0];
  if (!row) throw new Error("Documento ainda não transmitido.");
  return row;
}

export async function cancelDocument(
  rid: string,
  id: string,
  reason: string,
  actor: Actor,
) {
  const selected = await transaction(async (c) => {
    await lock(c, rid);
    const op = (
      await c.query<Operation & { result: { externalId?: string } }>(
        "SELECT o.* FROM integration_operations o JOIN fiscal_documents d ON d.operation_id=o.id AND d.restaurant_id=o.restaurant_id WHERE d.restaurant_id=$1 AND d.id=$2 FOR UPDATE OF d",
        [rid, id],
      )
    ).rows[0];
    if (!op || op.status !== "succeeded")
      throw new Error(
        "Somente documento autorizado pode solicitar cancelamento.",
      );
    const settings = focusAvailability(rid, op.environment);
    if (!settings.enabled)
      throw new Error("Conector deste ambiente desabilitado.");
    if (settings.cnpj && settings.cnpj !== op.payload.cnpj_emitente)
      throw new Error("Emitente incompatível.");
    const cancellation = await prepare(
      c,
      {
        restaurantId: rid,
        environment: op.environment,
        kind: "fiscal",
        provider: "focus",
        key: `fiscal_cancel:${id}`,
        payload: {
          _fiscal_model: op.payload._fiscal_model || "65",
          fiscal_action: "cancel",
          original_reference: op.reference,
          cnpj_emitente: String(op.payload.cnpj_emitente),
          justificativa: reason,
        },
      },
      actor,
    );
    await event(c, rid, actor, "cancellation_requested", id, {
      operationId: cancellation.id,
    });
    return {
      id: cancellation.id,
      cnpj: String(op.payload.cnpj_emitente),
      settings,
    };
  });
  const c = await database.connect();
  try {
    const result = await dispatch(
      c,
      rid,
      selected.id,
      focusProvider({
        restaurantId: rid,
        issuerCnpj: selected.cnpj,
        ...selected.settings,
        taxProfileValidated: true,
      }),
    );
    await recordOutcome(c, rid, id, result, actor, true);
    return { status: result?.status };
  } finally {
    c.release();
  }
}

export async function recordOutcome(
  c: PoolClient,
  rid: string,
  id: string,
  result: Operation | null,
  actor: Actor,
  cancellation = false,
) {
  if (result?.status === "succeeded" && !cancellation)
    await c.query(
      "UPDATE fiscal_documents SET issued_at=COALESCE(issued_at,$3::timestamptz),updated_at=now() WHERE restaurant_id=$1 AND id=$2",
      [rid, id, result.result?.fiscal?.issuedAt || result.payload.data_emissao],
    );
  if (result)
    await c.query(
      `INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail)
 SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM fiscal_events WHERE restaurant_id=$1 AND document_id=$2 AND action=$4 AND detail->>'operationId'=$6 AND detail->>'status'=$7)`,
      [
        rid,
        id,
        actor.name,
        cancellation ? "cancellation_processed" : "processed",
        {
          operationId: result.id,
          status: result.status,
          result: result.result,
        },
        result.id,
        result.status,
      ],
    );
}
