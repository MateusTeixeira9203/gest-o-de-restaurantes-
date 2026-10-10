import { query, transaction } from "@/lib/database";
import { currentRestaurant, businessDate } from "./service";
export type FinancialDocument = {
  id: string;
  kind: "payable" | "receivable";
  title: string;
  contact: string;
  category: string;
  amount_cents: string;
  paid_cents: string;
  due_date: string;
  competence_date: string;
  cancelled_at: string | null;
};
export type Shift = {
  id: string;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  opening_cents: string;
  expected_cents: string;
  counted_cents: string | null;
  closing_note: string | null;
};
export async function financialSnapshot(from: string, to: string) {
  return transaction(async (client) => {
    await client.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const rid = await currentRestaurant(client);
    const accounts = (
      await client.query<{
        code: string;
        name: string;
        kind: string;
        balance_cents: string;
      }>(
        `SELECT a.code,a.name,a.kind,COALESCE(sum(l.debit_cents-l.credit_cents),0) AS balance_cents FROM finance_accounts a LEFT JOIN finance_lines l ON l.account_id=a.id WHERE a.restaurant_id=$1 GROUP BY a.id ORDER BY a.code`,
        [rid],
      )
    ).rows;
    const shifts = (
      await client.query<Shift>(
        `SELECT s.id,s.opened_by,s.opened_at,s.closed_at,s.opening_cents,s.counted_cents,s.closing_note,COALESCE(s.expected_cents,s.opening_cents+COALESCE((SELECT sum(l.debit_cents-l.credit_cents) FROM finance_lines l JOIN finance_entries e ON e.id=l.entry_id JOIN finance_accounts a ON a.id=l.account_id WHERE e.cash_shift_id=s.id AND a.code='cash' AND e.source_type<>'shift_open'),0)) AS expected_cents FROM cash_shifts s WHERE restaurant_id=$1 ORDER BY opened_at DESC LIMIT 30`,
        [rid],
      )
    ).rows;
    const documents = (
      await client.query<FinancialDocument>(
        `SELECT d.id,d.kind,d.title,d.contact,d.category,d.amount_cents,d.competence_date::text,d.due_date::text,d.cancelled_at,COALESCE((SELECT sum(amount_cents) FROM finance_settlements s WHERE s.document_id=d.id AND s.reversed_at IS NULL),0) AS paid_cents FROM finance_documents d WHERE restaurant_id=$1 ORDER BY due_date,id`,
        [rid],
      )
    ).rows;
    const settlements = (
      await client.query<{
        id: string;
        document_id: string;
        amount_cents: string;
        paid_on: string;
        account_code: string;
        reversed_at: string | null;
      }>(
        `SELECT id,document_id,amount_cents,paid_on::text,account_code,reversed_at FROM finance_settlements WHERE restaurant_id=$1 ORDER BY paid_on DESC,id LIMIT 300`,
        [rid],
      )
    ).rows;
    const cards = (
      await client.query<{
        id: string;
        order_number: string;
        method: string;
        amount_cents: number;
        paid_at: string;
        reconciliation_entry_id: string | null;
      }>(
        `SELECT p.id,o.order_number,p.method,p.amount_cents,p.paid_at,p.reconciliation_entry_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1 AND p.status='paid' AND p.method IN ('credit','debit') AND p.finance_entry_id IS NOT NULL AND p.reconciliation_entry_id IS NULL ORDER BY p.paid_at`,
        [rid],
      )
    ).rows;
    const movements = (
      await client.query<{
        id: string;
        description: string;
        effective_date: string;
        actor_name: string;
        source_type: string;
        account: string;
        debit_cents: string;
        credit_cents: string;
      }>(
        `SELECT l.id,e.description,e.effective_date::text,e.actor_name,e.source_type,a.name AS account,l.debit_cents,l.credit_cents FROM finance_entries e JOIN finance_lines l ON l.entry_id=e.id JOIN finance_accounts a ON a.id=l.account_id WHERE e.restaurant_id=$1 AND e.effective_date BETWEEN $2::date AND $3::date ORDER BY e.created_at DESC,l.id LIMIT 400`,
        [rid, from, to],
      )
    ).rows;
    const metrics = (
      await client.query<{
        revenue_cents: string;
        expenses_cents: string;
        fees_cents: string;
        receipts_cents: string;
        outflows_cents: string;
      }>(
        `SELECT
   COALESCE(sum(l.credit_cents-l.debit_cents) FILTER(WHERE a.code IN('sales','other_income')),0) AS revenue_cents,
   COALESCE(sum(l.debit_cents-l.credit_cents) FILTER(WHERE a.code IN('operating','tax')),0) AS expenses_cents,
   COALESCE(sum(l.debit_cents-l.credit_cents) FILTER(WHERE a.code='fees'),0) AS fees_cents,
   COALESCE(sum(l.debit_cents) FILTER(WHERE a.code IN('cash','bank') AND e.source_type NOT IN('cash_move','shift_open','bank_opening')),0) AS receipts_cents,
   COALESCE(sum(l.credit_cents) FILTER(WHERE a.code IN('cash','bank') AND e.source_type NOT IN('cash_move','shift_open','bank_opening')),0) AS outflows_cents
   FROM finance_entries e JOIN finance_lines l ON l.entry_id=e.id JOIN finance_accounts a ON a.id=l.account_id WHERE e.restaurant_id=$1 AND e.effective_date BETWEEN $2::date AND $3::date`,
        [rid, from, to],
      )
    ).rows[0];
    const sales = (
      await client.query<{
        count: string;
        total_cents: string;
        service_cents: string;
        legacy_count: string;
      }>(
        `SELECT count(*) FILTER(WHERE served_at IS NOT NULL) AS count,COALESCE(sum(total_cents) FILTER(WHERE served_at IS NOT NULL),0) AS total_cents,COALESCE(sum(service_cents) FILTER(WHERE served_at IS NOT NULL),0) AS service_cents,count(*) FILTER(WHERE approval_origin='legacy') AS legacy_count FROM orders WHERE restaurant_id=$1 AND (COALESCE(served_at,created_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`,
        [rid, from, to],
      )
    ).rows[0];
    const dishes = (
      await client.query<{
        name: string;
        quantity: string;
        revenue_cents: string;
        cost_cents: string;
        missing_items: string;
        partial_items: string;
      }>(
        `SELECT oi.product_name||' · '||oi.variant_name AS name,sum(oi.quantity) AS quantity,sum(oi.quantity*(oi.unit_price_cents+COALESCE((SELECT sum((a->>'priceCents')::numeric) FROM jsonb_array_elements(oi.addons) a),0)))::bigint AS revenue_cents,COALESCE(sum(oi.quantity*(oi.cost_snapshot->>'unitCostCents')::numeric),0)::bigint AS cost_cents,count(*) FILTER(WHERE oi.cost_snapshot IS NULL OR oi.cost_snapshot->>'coverage'='absent') AS missing_items,count(*) FILTER(WHERE oi.cost_snapshot->>'coverage'='partial') AS partial_items FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.restaurant_id=$1 AND o.served_at IS NOT NULL AND (o.served_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY oi.product_name,oi.variant_name ORDER BY revenue_cents DESC`,
        [rid, from, to],
      )
    ).rows;
    const waste = (
      await client.query<{ cost_cents: string; incomplete: string }>(
        `SELECT COALESCE(sum(oi.quantity*(oi.cost_snapshot->>'unitCostCents')::numeric),0)::bigint AS cost_cents,count(*) FILTER(WHERE oi.cost_snapshot IS NULL OR oi.cost_snapshot->>'coverage'<>'complete') AS incomplete FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.restaurant_id=$1 AND o.status='cancelled' AND o.served_at IS NULL AND (o.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date AND EXISTS(SELECT 1 FROM kitchen_tickets kt WHERE kt.order_id=o.id AND (kt.started_at IS NOT NULL OR kt.ready_at IS NOT NULL))`,
        [rid, from, to],
      )
    ).rows[0];
    const bankOpeningRegistered = Boolean(
      (
        await client.query(
          "SELECT 1 FROM finance_entries WHERE restaurant_id=$1 AND source_type='bank_opening' LIMIT 1",
          [rid],
        )
      ).rowCount,
    );
    const series=(await client.query<{id:string;mode:string;title:string;occurrences:number;stopped_at:string|null}>("SELECT id,mode,title,occurrences,stopped_at FROM finance_series WHERE restaurant_id=$1 ORDER BY created_at DESC",[rid])).rows;
    const purchases=(await client.query<{id:string;supplier:string;reference:string;purchased_on:string;total_cents:string;cancelled_at:string|null;lines:Array<{id:string;name:string;input_quantity:string;input_unit:string;base_quantity:string;base_unit:string;received_quantity:string}>}>(`SELECT p.id,p.supplier,p.reference,p.purchased_on::text,p.total_cents,p.cancelled_at,json_agg(json_build_object('id',l.id,'name',i.name,'input_quantity',l.input_quantity,'input_unit',l.input_unit,'base_quantity',l.base_quantity,'base_unit',l.base_unit,'received_quantity',l.received_quantity) ORDER BY l.id) AS lines FROM purchases p JOIN purchase_lines l ON l.purchase_id=p.id JOIN inventory_items i ON i.id=l.inventory_item_id WHERE p.restaurant_id=$1 GROUP BY p.id ORDER BY p.created_at DESC`,[rid])).rows;
    return {
      series,purchases,
      bankOpeningRegistered,
      today: businessDate(),
      from,
      to,
      accounts,
      shifts,
      documents,
      settlements,
      cards,
      movements,
      metrics,
      sales,
      dishes,
      waste,
    };
  });
}
export type FinancialSnapshot = Awaited<ReturnType<typeof financialSnapshot>>;
export async function financeExport(from: string, to: string) {
  const rid = await currentRestaurant();
  const rows = (
    await query<{
      date: string;
      entry: string;
      source: string;
      description: string;
      account: string;
      debit_cents: string;
      credit_cents: string;
      actor: string;
    }>(
      `SELECT e.effective_date::text AS date,e.id AS entry,e.source_type AS source,e.description,a.name AS account,l.debit_cents,l.credit_cents,e.actor_name AS actor FROM finance_entries e JOIN finance_lines l ON l.entry_id=e.id JOIN finance_accounts a ON a.id=l.account_id WHERE e.restaurant_id=$1 AND e.effective_date BETWEEN $2::date AND $3::date ORDER BY e.effective_date,e.id,l.id`,
      [rid, from, to],
    )
  ).rows;
  const escape = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^\s*[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const fields = [
    "date",
    "entry",
    "source",
    "description",
    "account",
    "debit_cents",
    "credit_cents",
    "actor",
  ] as const;
  return (
    "\uFEFF" +
    [
      [
        "Data",
        "Lançamento",
        "Origem",
        "Descrição",
        "Conta",
        "Débito (centavos)",
        "Crédito (centavos)",
        "Responsável",
      ]
        .map(escape)
        .join(";"),
      ...rows.map((r) => fields.map((f) => escape(r[f])).join(";")),
    ].join("\r\n")
  );
}
