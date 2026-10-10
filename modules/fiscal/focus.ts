import type { Operation, Provider, Result } from "../integrations/contracts.ts";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Config = { restaurantId: string; issuerCnpj: string; token: string; enabled: boolean; taxProfileValidated: boolean };
const base = "https://homologacao.focusnfe.com.br";
export function focusHomologation(config: Config, transport: Transport = fetch): Provider {
  const provider: Provider = {
    id:"focus",kind:"fiscal",environment:"homologation",restaurantId:config.restaurantId,enabled:config.enabled,
    submit: operation => request(operation,true),
    consult: operation => request(operation,false),
  };
  async function request(operation: Operation, submit: boolean): Promise<Result> {
    if (!config.enabled || !config.taxProfileValidated || !config.token || !/^\d{14}$/.test(config.issuerCnpj)) throw new Error("Configuração fiscal incompleta.");
    if (operation.restaurant_id !== config.restaurantId || operation.environment !== "homologation" || operation.kind !== "fiscal" || operation.provider !== "focus") throw new Error("Contexto fiscal incompatível.");
    if (operation.payload.cnpj_emitente !== config.issuerCnpj) throw new Error("Emitente incompatível.");
    if (!/^gf_[a-f0-9]{32}$/.test(operation.reference)) throw new Error("Referência inválida.");
    if (submit && (!Array.isArray(operation.payload.items) || !operation.payload.items.length || !Array.isArray(operation.payload.formas_pagamento) || !operation.payload.formas_pagamento.length)) throw new Error("Documento fiscal incompleto.");
    const url = submit ? `${base}/v2/nfce?ref=${operation.reference}` : `${base}/v2/nfce/${operation.reference}`;
    const response = await transport(url,{
      method:submit ? "POST" : "GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Basic ${Buffer.from(config.token+":").toString("base64")}`,Accept:"application/json",...(submit ? {"Content-Type":"application/json"} : {})},
      ...(submit ? {body:JSON.stringify(operation.payload)} : {}),
    });
    // A missing reference after an uncertain request is not permission to transmit again.
    if (!response.ok) return {status:"unknown",code:`focus_http_${response.status}`};
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {status:"unknown",code:"focus_invalid_response"};
    const data = body as Record<string, unknown>;
    if ((data.ref && data.ref !== operation.reference) || (data.cnpj_emitente && data.cnpj_emitente !== config.issuerCnpj)) return {status:"unknown",code:"focus_context_mismatch"};
    if (data.status === "autorizado" && typeof data.chave_nfe === "string" && /^\d{44}$/.test(data.chave_nfe)) return {status:"succeeded",code:"focus_authorized",externalId:data.chave_nfe};
    if (data.status === "erro_autorizacao") return {status:"failed",code:"focus_rejected"};
    if (data.status === "cancelado") return {status:"cancelled",code:"focus_cancelled"};
    if (data.status === "processando_autorizacao") return {status:"pending",code:"focus_processing"};
    // Offline/contingency is not an authorization. Unknown/new statuses require review.
    return {status:"unknown",code:"focus_unconfirmed"};
  }
  return provider;
}
