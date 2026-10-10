import { z } from "zod";
import { paymentEvidence, validatePayment } from "../integrations/contracts.ts";
import type { Operation, PaymentCapability, PaymentRequest, Provider } from "../integrations/contracts.ts";

const payloadSchema = z.object({
  amountCents:z.number().int().positive().max(2_000_000_000),currency:z.literal("BRL"),
  method:z.enum(["pix","credit","debit"]),channel:z.enum(["direct","terminal"]),
  terminalId:z.string().trim().min(1).max(100).optional(),
}).strict();
export type PaymentObservation = {
  reference:string;amountCents:number;currency:string;status:string;externalId?:string;
};
// Implemented by a provider-specific, authenticated server adapter after equipment validation.
// submit/lookup MUST use merchant-scoped credentials, map provider statuses, and never log secrets.
export interface PaymentConnector {
  id:string;
  restaurantId:string;
  enabled:boolean;
  capabilities:readonly PaymentCapability[];
  submit(request:PaymentRequest & {reference:string}):Promise<PaymentObservation>;
  lookup(reference:string):Promise<PaymentObservation>;
}
export function paymentHomologation(connector:PaymentConnector):Provider {
  function request(operation:Operation) {
    if (!connector.enabled || operation.kind !== "payment" || operation.environment !== "homologation" || operation.restaurant_id !== connector.restaurantId || operation.provider !== connector.id) throw new Error("Contexto de pagamento incompatível ou desabilitado.");
    const parsed=payloadSchema.parse(operation.payload);
    validatePayment(parsed,connector.capabilities);
    return {...parsed,reference:operation.reference};
  }
  return {
    id:connector.id,kind:"payment",environment:"homologation",restaurantId:connector.restaurantId,enabled:connector.enabled,
    async submit(operation) {
      const expected=request(operation);
      return paymentEvidence(expected,await connector.submit(expected));
    },
    async consult(operation) {
      const expected=request(operation);
      return paymentEvidence(expected,await connector.lookup(operation.reference));
    },
  };
}
