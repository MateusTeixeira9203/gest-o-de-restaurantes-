import type { PoolClient } from "pg";
import type { Environment } from "../integrations/contracts";
import { zipFiles } from "./zip";
const csv = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@-]/, "'")
    .replaceAll('"', '""') +
  '"';
export async function exportFiscal(
  c: PoolClient,
  rid: string,
  environment: Environment,
  period: { from: string; to: string },
  actor: string,
) {
  const docs = (
    await c.query(
      `SELECT d.id,d.environment,d.created_at,d.issued_at,d.blockers,d.snapshot->'totalCents' AS total_cents,d.snapshot->'payload'->>'_fiscal_model' AS model,
 CASE WHEN co.status='succeeded' THEN 'cancelled' ELSE COALESCE(o.status,'draft') END AS status,co.status AS cancellation_status,o.reference,o.result
 FROM fiscal_documents d LEFT JOIN integration_operations o ON o.id=d.operation_id AND o.restaurant_id=d.restaurant_id
 LEFT JOIN integration_operations co ON co.restaurant_id=d.restaurant_id AND co.environment=d.environment AND co.kind='fiscal' AND co.operation_key='fiscal_cancel:'||d.id::text
 WHERE d.restaurant_id=$1 AND d.environment=$4 AND (
 (COALESCE(d.issued_at,d.created_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3
 OR EXISTS(SELECT 1 FROM fiscal_events e WHERE e.restaurant_id=$1 AND e.document_id=d.id AND e.action IN ('processed','cancellation_processed') AND e.detail->>'status' IN ('succeeded','cancelled') AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3))
 ORDER BY COALESCE(d.issued_at,d.created_at),d.id LIMIT 501`,
      [rid, period.from, period.to, environment],
    )
  ).rows;
  if (docs.length > 500)
    throw new Error(
      "Selecione um período menor: limite de 500 documentos por pacote.",
    );
  const ids = docs.map((d) => d.id);
  const size = (
    await c.query(
      "SELECT COALESCE(sum(octet_length(content)),0) AS size FROM fiscal_files WHERE restaurant_id=$1 AND document_id=ANY($2::uuid[])",
      [rid, ids],
    )
  ).rows[0];
  if (Number(size.size) > 32 * 1024 * 1024)
    throw new Error("Selecione um período menor: pacote acima de 32 MB.");
  const files = (
    await c.query(
      "SELECT document_id,kind,content,mime,sha256 FROM fiscal_files WHERE restaurant_id=$1 AND document_id=ANY($2::uuid[]) ORDER BY document_id,kind",
      [rid, ids],
    )
  ).rows;
  const events = (
    await c.query(
      "SELECT document_id,action,created_at,detail FROM fiscal_events WHERE restaurant_id=$1 AND document_id=ANY($2::uuid[]) AND action IN ('processed','cancellation_processed') ORDER BY created_at",
      [rid, ids],
    )
  ).rows;
  const index = docs.map((d) => ({
    ...d,
    files: files
      .filter((f) => f.document_id === d.id)
      .map((f) => ({ kind: f.kind, sha256: f.sha256 })),
    missingXml: !files.some((f) => f.document_id === d.id && f.kind === "xml"),
    missingAuthorizationMetadata:
      !d.result?.externalId ||
      !d.result?.fiscal?.number ||
      !d.result?.fiscal?.series ||
      !d.result?.fiscal?.protocol,
  }));
  const unprepared = (
    await c.query(
      `SELECT o.id,o.order_number,o.total_cents FROM orders o WHERE o.restaurant_id=$1 AND o.status IN ('completed','delivered') AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3 AND NOT EXISTS(SELECT 1 FROM fiscal_order_links l WHERE l.restaurant_id=$1 AND l.environment=$4 AND l.order_id=o.id) ORDER BY o.created_at LIMIT 501`,
      [rid, period.from, period.to, environment],
    )
  ).rows;
  if (unprepared.length > 500)
    throw new Error(
      "Selecione um período menor para listar as vendas sem preparação.",
    );
  const incomplete =
    unprepared.length > 0 ||
    index.some(
      (d) =>
        d.missingXml ||
        d.missingAuthorizationMetadata ||
        !["succeeded", "cancelled"].includes(d.status) ||
        (d.status === "cancelled" &&
          !d.files.some((f: { kind: string }) => f.kind === "cancellation")) ||
        (d.cancellation_status && d.cancellation_status !== "succeeded"),
    );
  const rows = [
    [
      "documento",
      "ambiente",
      "modelo",
      "chave",
      "numero",
      "serie",
      "protocolo",
      "emissao",
      "valor_centavos",
      "estado",
      "xml_ausente",
    ],
    ...index.map((d) => [
      d.id,
      environment,
      d.model || "65",
      d.result?.externalId,
      d.result?.fiscal?.number,
      d.result?.fiscal?.series,
      d.result?.fiscal?.protocol,
      d.issued_at?.toISOString(),
      d.total_cents,
      d.status,
      d.missingXml,
    ]),
  ];
  const criteria =
    "Emissao em America/Sao_Paulo; preparacoes ainda nao emitidas pela data de criacao; inclui eventos autorizados/cancelamentos do periodo sobre notas anteriores.";
  const entries = [
    {
      name: "LEIA-ME.txt",
      content: Buffer.from(
        `${environment === "homologation" ? "HOMOLOGACAO - SEM VALIDADE FISCAL" : "PRODUCAO"}\nPacote ${incomplete ? "INCOMPLETO: consulte pendencias no indice" : "sem pendencias detectadas no recorte"}.\n${criteria}\nNao substitui escrituracao, SPED ou validacao do contador.\n`,
      ),
    },
    {
      name: "indice.json",
      content: Buffer.from(
        JSON.stringify(
          {
            environment,
            period,
            criteria,
            incomplete,
            documents: index,
            events,
            unpreparedSales: unprepared,
          },
          null,
          2,
        ),
      ),
    },
    {
      name: "indice.csv",
      content: Buffer.from(
        "\uFEFF" + rows.map((row) => row.map(csv).join(";")).join("\r\n"),
      ),
    },
    ...files.map((f) => ({
      name: `documentos/${f.document_id}/${f.kind}.${f.mime === "application/pdf" ? "pdf" : f.mime === "text/html" ? "html" : "xml"}`,
      content: f.content,
    })),
  ];
  await c.query(
    "INSERT INTO fiscal_events(restaurant_id,actor,action,detail) VALUES($1,$2,'exported',$3)",
    [rid, actor, { environment, period, count: docs.length, incomplete }],
  );
  return zipFiles(entries);
}
