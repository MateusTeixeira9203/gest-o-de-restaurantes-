import type {
  Environment,
  Operation,
  Provider,
  Result,
} from "../integrations/contracts.ts";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
import { focusHosts } from "./config.ts";
type Config = {
  restaurantId: string;
  issuerCnpj: string;
  token: string;
  enabled: boolean;
  taxProfileValidated: boolean;
  environment?: Environment;
  productionApproved?: boolean;
};

export function focusProvider(
  config: Config,
  transport: Transport = fetch,
): Provider {
  const environment = config.environment || "homologation",
    base = focusHosts[environment];
  const productionAuthorized =
    environment === "production" &&
    config.productionApproved === true &&
    process.env.FOCUS_NFE_PRODUCTION_ENABLED === "true";
  const provider: Provider = {
    id: "focus",
    kind: "fiscal",
    environment,
    restaurantId: config.restaurantId,
    enabled: config.enabled,
    productionAuthorized,
    prepareSubmission: (operation) =>
      operation.payload.fiscal_action === "cancel"
        ? operation.payload
        : { ...operation.payload, data_emissao: new Date().toISOString() },
    submit: (operation) => request(operation, true),
    consult: (operation) => request(operation, false),
  };
  async function request(
    operation: Operation,
    submit: boolean,
  ): Promise<Result> {
    if (environment === "production" && !productionAuthorized)
      throw new Error("Produção desabilitada.");
    if (
      !config.enabled ||
      !config.taxProfileValidated ||
      !config.token ||
      !/^\d{14}$/.test(config.issuerCnpj)
    )
      throw new Error("Configuração fiscal incompleta.");
    if (
      operation.restaurant_id !== config.restaurantId ||
      operation.environment !== environment ||
      operation.kind !== "fiscal" ||
      operation.provider !== "focus"
    )
      throw new Error("Contexto fiscal incompatível.");
    if (operation.payload.cnpj_emitente !== config.issuerCnpj)
      throw new Error("Emitente incompatível.");
    if (!/^gf_[a-f0-9]{32}$/.test(operation.reference))
      throw new Error("Referência inválida.");
    const endpoint = operation.payload._fiscal_model === "55" ? "nfe" : "nfce";
    const cancelling = operation.payload.fiscal_action === "cancel";
    const reference = cancelling
      ? String(operation.payload.original_reference)
      : operation.reference;
    if (!/^gf_[a-f0-9]{32}$/.test(reference))
      throw new Error("Referência original inválida.");
    if (
      cancelling &&
      (typeof operation.payload.justificativa !== "string" ||
        operation.payload.justificativa.length < 15 ||
        operation.payload.justificativa.length > 255)
    )
      throw new Error("Justificativa inválida.");
    if (
      submit &&
      !cancelling &&
      (!Array.isArray(operation.payload.items) ||
        !operation.payload.items.length ||
        !Array.isArray(operation.payload.formas_pagamento) ||
        !operation.payload.formas_pagamento.length)
    )
      throw new Error("Documento fiscal incompleto.");
    const url =
      submit && !cancelling
        ? `${base}/v2/${endpoint}?ref=${reference}&completa=1`
        : `${base}/v2/${endpoint}/${reference}`;
    const payload = Object.fromEntries(
      Object.entries(operation.payload).filter(
        ([key]) => key !== "_fiscal_model",
      ),
    );
    const response = await transport(url, {
      method: submit ? (cancelling ? "DELETE" : "POST") : "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(config.token + ":").toString("base64")}`,
        Accept: "application/json",
        ...(submit ? { "Content-Type": "application/json" } : {}),
      },
      ...(submit
        ? {
            body: JSON.stringify(
              cancelling
                ? { justificativa: operation.payload.justificativa }
                : payload,
            ),
          }
        : {}),
    });
    // A missing reference after an uncertain request is not permission to transmit again.
    if (!response.ok) {
      // Only definitive refusal before issuance may be revised. 409/422 may mean a reused reference.
      if (submit && !cancelling && [401, 403, 415].includes(response.status))
        return {
          status: "failed",
          code: `focus_http_${response.status}`,
          message:
            "A Focus recusou acesso/formato. Confira a configuração antes de revisar.",
        };
      return {
        status: "unknown",
        code: `focus_http_${response.status}`,
        message:
          "Resposta não confirmada. Consulte a mesma referência; não crie outra nota.",
      };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return { status: "unknown", code: "focus_invalid_response" };
    const data = body as Record<string, unknown>;
    if (
      (data.ref && data.ref !== reference) ||
      (data.cnpj_emitente && data.cnpj_emitente !== config.issuerCnpj)
    )
      return { status: "unknown", code: "focus_context_mismatch" };
    const fiscal: NonNullable<Result["fiscal"]> = {};
    for (const [target, source] of [
      ["number", "numero"],
      ["series", "serie"],
      ["protocol", "numero_protocolo"],
      ["statusCode", "status_sefaz"],
    ] as const) {
      const v = String(data[source] ?? "");
      if (/^\d{1,20}$/.test(v)) fiscal[target] = v;
    }
    const complete = data.protocolo_nota_fiscal as
      | Record<string, unknown>
      | undefined;
    if (
      complete &&
      typeof complete === "object" &&
      /^\d{1,20}$/.test(String(complete.numero_protocolo ?? ""))
    )
      fiscal.protocol = String(complete.numero_protocolo);
    const issuedAt = String(operation.payload.data_emissao || "");
    if (Number.isFinite(Date.parse(issuedAt)))
      fiscal.issuedAt = new Date(issuedAt).toISOString();
    if (cancelling) {
      if (data.status === "erro_cancelamento")
        return {
          status: "failed",
          code: "focus_cancellation_rejected",
          message:
            typeof data.mensagem_sefaz === "string"
              ? data.mensagem_sefaz.slice(0, 500)
              : "Cancelamento recusado. A nota original permanece autorizada.",
        };
      if (data.status === "cancelado")
        return { status: "succeeded", code: "focus_cancellation_confirmed" };
      return { status: "unknown", code: "focus_cancellation_unconfirmed" };
    }
    if (
      data.status === "autorizado" &&
      typeof data.chave_nfe === "string" &&
      /^\d{44}$/.test(data.chave_nfe)
    )
      return {
        status: "succeeded",
        code: "focus_authorized",
        externalId: data.chave_nfe,
        fiscal,
      };
    if (data.status === "denegado")
      return {
        status: "failed",
        code: "focus_denied",
        message:
          "Documento denegado. Exige análise fiscal; não pode ser reemitido por revisão.",
      };
    if (data.status === "erro_autorizacao")
      return {
        status: "failed",
        code: "focus_rejected",
        ...(typeof data.mensagem_sefaz === "string"
          ? { message: data.mensagem_sefaz.slice(0, 500) }
          : {}),
      };
    if (data.status === "cancelado")
      return { status: "cancelled", code: "focus_cancelled" };
    if (data.status === "processando_autorizacao")
      return { status: "pending", code: "focus_processing" };
    // Offline/contingency is not an authorization. Unknown/new statuses require review.
    return { status: "unknown", code: "focus_unconfirmed" };
  }
  return provider;
}

export function focusHomologation(
  config: Config,
  transport: Transport = fetch,
) {
  return focusProvider({ ...config, environment: "homologation" }, transport);
}
