import { createHash } from "node:crypto";

export type OrderActor = { role: string; name: string; staffId?: string };
export function assertOrderApprover(actor: OrderActor) {
  if (
    !["admin", "manager", "waiter", "cashier"].includes(actor.role) ||
    !actor.name.trim()
  ) {
    throw new Error(
      "Somente garçom ou caixa autorizado pode enviar pedidos à cozinha.",
    );
  }
}
export function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
