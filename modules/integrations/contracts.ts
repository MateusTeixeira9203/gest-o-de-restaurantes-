export type Environment = "homologation" | "production";
export type Kind = "fiscal" | "payment";
export type Status =
  | "prepared"
  | "dispatching"
  | "unknown"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Result = {
  status: "unknown" | "pending" | "succeeded" | "failed" | "cancelled";
  code: string;
  message?: string;
  // Only normalized, non-secret evidence. Never persist entire provider responses.
  externalId?: string;
  fiscal?: {
    number?: string;
    series?: string;
    protocol?: string;
    issuedAt?: string;
    statusCode?: string;
  };
};
export type Operation = {
  id: string;
  restaurant_id: string;
  environment: Environment;
  kind: Kind;
  provider: string;
  reference: string;
  payload: Record<string, Json>;
  status: Status;
  result?: Result | null;
  lease_token: string | null;
};
export interface Provider {
  id: string;
  kind: Kind;
  environment: Environment;
  restaurantId: string;
  enabled: boolean;
  productionAuthorized?: boolean;
  prepareSubmission?(operation: Operation): Record<string, Json>;
  submit(operation: Operation): Promise<Result>;
  consult(operation: Operation): Promise<Result>;
}
export type Actor = { role: string; name: string };
export function authorize(kind: Kind, actor: Actor) {
  const roles =
    kind === "fiscal"
      ? ["admin", "manager", "cashier"]
      : ["admin", "manager", "cashier", "waiter"];
  if (!roles.includes(actor.role) || !actor.name.trim())
    throw new Error("Operação não permitida para este perfil.");
}

export type PaymentRequest = {
  amountCents: number;
  currency: "BRL";
  method: "pix" | "credit" | "debit";
  channel: "direct" | "terminal";
  terminalId?: string;
};
export type PaymentCapability = {
  method: PaymentRequest["method"];
  channel: PaymentRequest["channel"];
};
export function validatePayment(
  request: PaymentRequest,
  capabilities: readonly PaymentCapability[],
) {
  if (
    !Number.isSafeInteger(request.amountCents) ||
    request.amountCents <= 0 ||
    request.amountCents > 2_000_000_000 ||
    request.currency !== "BRL"
  )
    throw new Error("Valor de cobrança inválido.");
  if (
    !capabilities.some(
      (c) => c.method === request.method && c.channel === request.channel,
    )
  )
    throw new Error("Meio/canal não suportado por este conector.");
  if (request.channel === "terminal" && !request.terminalId?.trim())
    throw new Error("Terminal não configurado.");
  if (request.channel === "direct" && request.terminalId)
    throw new Error("Cobrança direta não usa terminal.");
}
// A verified server-to-server lookup must produce this evidence. Browser and raw webhooks cannot confirm payments.
export function paymentEvidence(
  expected: PaymentRequest & { reference: string },
  observed: {
    reference: string;
    amountCents: number;
    currency: string;
    status: string;
    externalId?: string;
  },
): Result {
  if (
    observed.reference !== expected.reference ||
    observed.amountCents !== expected.amountCents ||
    observed.currency !== expected.currency
  )
    return { status: "unknown", code: "payment_evidence_mismatch" };
  if (observed.status === "paid" && observed.externalId)
    return {
      status: "succeeded",
      code: "payment_confirmed",
      externalId: observed.externalId,
    };
  // Expiration/cancellation races require provider-specific handling; do not discard a possible late payment.
  return { status: "pending", code: "payment_requires_confirmation" };
}
