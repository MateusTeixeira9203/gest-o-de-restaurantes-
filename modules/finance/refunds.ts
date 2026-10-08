import { transaction } from "@/lib/database";
import {
  currentRestaurant,
  financeLock,
  openShift,
  postEntry,
  type Actor,
} from "./service";
export async function refundAndCancel(
  orderId: string,
  reason: string,
  actor: Actor,
) {
  if (!["admin", "manager"].includes(actor.role))
    throw new Error("Somente gestão pode estornar vendas.");
  return transaction(async (client) => {
    const rid = await currentRestaurant(client);
    const order = (
      await client.query<{
        total_cents: number;
        service_cents: number;
        served_at: Date | null;
        status: string;
        started: boolean;
      }>(
        `SELECT o.total_cents,o.service_cents,o.served_at,o.status,EXISTS(SELECT 1 FROM kitchen_tickets WHERE order_id=o.id AND (started_at IS NOT NULL OR ready_at IS NOT NULL)) AS started FROM orders o WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
        [orderId, rid],
      )
    ).rows[0];
    if (!order) throw new Error("Pedido não encontrado.");
    if (order.status === "cancelled") return { ok: true };
    await financeLock(client, rid);
    const payments = (
      await client.query<{
        id: string;
        method: string;
        amount_cents: number;
        finance_entry_id: string | null;
        reconciliation_entry_id: string | null;
      }>(
        "SELECT id,method,amount_cents,finance_entry_id,reconciliation_entry_id FROM payments WHERE order_id=$1 AND status='paid' FOR UPDATE",
        [orderId],
      )
    ).rows;
    if (!payments.length)
      throw new Error(
        "Pedido sem recebimentos; use o cancelamento operacional.",
      );
    if (payments.some((p) => !p.finance_entry_id))
      throw new Error(
        "Recebimento anterior à atualização: exige conferência e lançamento de abertura antes de estorno financeiro.",
      );
    const cashRefund = payments
      .filter((p) => p.method === "cash")
      .reduce((s, p) => s + p.amount_cents, 0);
    const shift = cashRefund > 0 ? await openShift(client, rid) : undefined;
    if (shift) {
      const expected = Number(
        (
          await client.query<{ amount: string }>(
            `SELECT s.opening_cents+COALESCE((SELECT sum(l.debit_cents-l.credit_cents) FROM finance_entries e JOIN finance_lines l ON l.entry_id=e.id JOIN finance_accounts a ON a.id=l.account_id WHERE e.cash_shift_id=s.id AND a.code='cash' AND e.source_type<>'shift_open'),0) AS amount FROM cash_shifts s WHERE s.id=$1`,
            [shift],
          )
        ).rows[0].amount,
      );
      if (expected < cashRefund)
        throw new Error(
          "Caixa sem dinheiro suficiente para registrar a devolução.",
        );
    }
    const paid = payments.reduce((s, p) => s + p.amount_cents, 0);
    const credits = payments.map((p) => ({
      code:
        p.method === "cash"
          ? "cash"
          : p.method === "pix" || p.reconciliation_entry_id
            ? "bank"
            : "cards",
      credit: p.amount_cents,
    }));
    await postEntry(
      client,
      rid,
      actor,
      "sale_refund",
      orderId,
      reason,
      [
        {
          code: order.served_at ? "sales" : "advances",
          debit: order.served_at
            ? order.total_cents - order.service_cents
            : paid,
        },
        ...(order.served_at
          ? [{ code: "service_payable", debit: order.service_cents }]
          : []),
        ...credits,
        ...(order.served_at && paid < order.total_cents
          ? [{ code: "receivable", credit: order.total_cents - paid }]
          : []),
      ],
      undefined,
      shift,
    );
    await client.query(
      "UPDATE payments SET status='refunded' WHERE order_id=$1 AND status='paid'",
      [orderId],
    );
    if (!order.started) {
      const movements = (
        await client.query<{
          inventory_item_id: string;
          quantity_delta: string;
        }>(
          "SELECT inventory_item_id,quantity_delta FROM inventory_movements WHERE order_id=$1 AND type='sale_consumption' ORDER BY inventory_item_id",
          [orderId],
        )
      ).rows;
      for (const movement of movements) {
        await client.query(
          "UPDATE inventory_items SET quantity=quantity-$2::numeric,updated_at=now() WHERE id=$1",
          [movement.inventory_item_id, movement.quantity_delta],
        );
        await client.query(
          "INSERT INTO inventory_movements(restaurant_id,inventory_item_id,type,quantity_delta,order_id,note) VALUES($1,$2,'cancellation_return',-$3::numeric,$4,$5)",
          [
            rid,
            movement.inventory_item_id,
            movement.quantity_delta,
            orderId,
            reason,
          ],
        );
      }
    }
    await client.query(
      "UPDATE kitchen_tickets SET status='cancelled',updated_at=now() WHERE order_id=$1",
      [orderId],
    );
    await client.query(
      "UPDATE orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1",
      [orderId],
    );
    await client.query(
      "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'sale_refunded',$2,$3::jsonb)",
      [
        orderId,
        actor.role,
        JSON.stringify({
          reason,
          processedBy: actor.name,
          inventoryDisposition: order.started
            ? "consumed_in_production"
            : "returned",
          manualConfirmation: true,
        }),
      ],
    );
    return { ok: true };
  });
}
