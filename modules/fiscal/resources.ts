import { createHash } from "node:crypto";
import { validateFiscalXml } from "./xml";
import { query } from "@/lib/database";
import { fiscalOperation, focusAvailability } from "./service";
import { focusHosts } from "./config";
import type { Environment } from "../integrations/contracts";
export function focusFileUrl(
  path: string,
  environment: Environment = "homologation",
) {
  const host = focusHosts[environment];
  const url = new URL(path, host);
  if (
    url.origin !== host ||
    url.username ||
    url.password ||
    !["/arquivos/", "/notas_fiscais_consumidor/"].some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  )
    throw new Error("Endereço de arquivo fiscal não permitido.");
  return url;
}
async function boundedBody(response: Response, max: number) {
  if (!response.ok || !response.body)
    throw new Error("Arquivo fiscal não disponível.");
  if (Number(response.headers.get("content-length")) > max)
    throw new Error("Arquivo excede limite.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) throw new Error("Arquivo excede limite.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export async function collectFiles(rid: string, id: string) {
  const op = await fiscalOperation(rid, id);
  const settings = focusAvailability(rid, op.environment);
  const host = focusHosts[op.environment];
  if (!settings.enabled)
    throw new Error("Conector deste ambiente desabilitado.");
  if (settings.cnpj && settings.cnpj !== op.payload.cnpj_emitente)
    throw new Error("Emitente incompatível.");
  if (!["succeeded", "cancelled"].includes(op.status))
    throw new Error("Aguarde autorização antes de buscar arquivos.");
  const headers = {
    Authorization: `Basic ${Buffer.from(settings.token + ":").toString("base64")}`,
  };
  const response = await fetch(
    `${host}/v2/${op.payload._fiscal_model === "55" ? "nfe" : "nfce"}/${encodeURIComponent(op.reference)}`,
    {
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error("Não foi possível consultar os arquivos na Focus.");
  const data = (await response.json()) as Record<string, unknown>;
  if (
    !["autorizado", "cancelado"].includes(String(data.status)) ||
    typeof data.chave_nfe !== "string" ||
    !/^\d{44}$/.test(data.chave_nfe)
  )
    throw new Error("Autorização não confirmada.");
  if (data.ref && data.ref !== op.reference)
    throw new Error("Referência fiscal divergente.");
  if (op.result?.externalId && data.chave_nfe !== op.result.externalId)
    throw new Error("Chave fiscal divergente da autorização original.");
  if (data.cnpj_emitente && data.cnpj_emitente !== op.payload.cnpj_emitente)
    throw new Error("Emitente divergente.");
  const files = [
    ["xml", "caminho_xml_nota_fiscal", "application/xml"],
    ["auxiliary", "caminho_danfe", "application/pdf"],
    ["cancellation", "caminho_xml_cancelamento", "application/xml"],
  ];
  const saved: string[] = [];
  const missing: string[] = [];
  for (const [kind, key, expectedMime] of files) {
    let mime = expectedMime;
    if (typeof data[key] !== "string") {
      if (kind !== "cancellation" || data.status === "cancelado")
        missing.push(kind);
      continue;
    }
    try {
      const url = focusFileUrl(data[key] as string, op.environment);
      let content = await boundedBody(
        await fetch(url, {
          headers,
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
        8 * 1024 * 1024,
      );
      if (
        kind === "auxiliary" &&
        !content.subarray(0, 5).equals(Buffer.from("%PDF-"))
      ) {
        if (
          !/^\s*(?:<!doctype html[^>]*>\s*)?<html[\s>]/i.test(
            content.toString("utf8"),
          )
        )
          throw new Error("Formato auxiliar não suportado.");
        mime = "text/html";
        // The policy travels with the downloaded HTML too; scripts remain blocked outside our server.
        const policy =
          "default-src 'none'; script-src 'none'; img-src data: https://homologacao.focusnfe.com.br https://api.focusnfe.com.br; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
        content = Buffer.from(
          `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${content.toString("utf8")}</body></html>`,
        );
      }
      if (kind !== "auxiliary") {
        const metadata = validateFiscalXml(
          content,
          data.chave_nfe,
          String(op.payload.cnpj_emitente),
          kind,
        );
        if (metadata && op.result?.fiscal) {
          for (const field of ["number", "series", "protocol"] as const) {
            const original = op.result.fiscal[field];
            if (
              original &&
              String(original).replace(/^0+/, "") !==
                metadata[field].replace(/^0+/, "")
            )
              throw new Error("Metadados do XML divergem da autorização.");
          }
        }
        if (metadata)
          await query(
            "UPDATE integration_operations SET result=jsonb_set(COALESCE(result,'{}'::jsonb),'{fiscal}',COALESCE(result->'fiscal','{}'::jsonb)||$3::jsonb) WHERE restaurant_id=$1 AND id=$2",
            [rid, op.id, metadata],
          );
      }
      await query(
        `INSERT INTO fiscal_files(restaurant_id,document_id,kind,content,mime,sha256) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(document_id,kind) DO NOTHING`,
        [
          rid,
          id,
          kind,
          content,
          mime,
          createHash("sha256").update(content).digest("hex"),
        ],
      );
      saved.push(kind);
    } catch {
      missing.push(kind);
    }
  }
  await query(
    "INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail) VALUES($1,$2,'system','files_collected',$3)",
    [rid, id, { saved, missing }],
  );
  return { saved, missing };
}
