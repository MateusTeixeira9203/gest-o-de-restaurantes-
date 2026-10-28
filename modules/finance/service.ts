import { monthlyDate, installments, convertQuantity } from "./planning";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { restaurantContext } from "@/modules/tenancy/context";
import { transaction } from "@/lib/database";
import { requestHash } from "@/modules/orders/policy";
import type { FinanceCommand } from "./schema";
export type Actor = { name: string; role: string };
type Line = { code: string; debit?: number; credit?: number };
export function businessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export async function currentRestaurant(client?: PoolClient) {
  return (await restaurantContext(client)).id;
}
export async function financeLock(client: PoolClient, rid: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `finance:${rid}`,
  ]);
}
export async function openShift(client: PoolClient, rid: string) {
  const shift = (
    await client.query<{ id: string }>(
      "SELECT id FROM cash_shifts WHERE restaurant_id=$1 AND closed_at IS NULL FOR UPDATE",
      [rid],
    )
  ).rows[0];
  if (!shift)
    throw new Error(
      "Abra o caixa antes de registrar recebimentos ou movimentos em dinheiro.",
    );
  return shift.id;
}
export async function postEntry(
  client: PoolClient,
  rid: string,
  actor: Actor,
  sourceType: string,
  sourceId: string,
  description: string,
  lines: Line[],
  date = businessDate(),
  shiftId?: string,
  reversesId?: string,
) {
  const filtered = lines.filter((line) => (line.debit || line.credit || 0) > 0);
  if (
    filtered.length < 2 ||
    filtered.some((l) => !Number.isSafeInteger(l.debit || l.credit)) ||
    filtered.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) !== 0
  )
    throw new Error("Lançamento desequilibrado.");
  const entry = (
    await client.query<{ id: string }>(
      `INSERT INTO finance_entries(restaurant_id,source_type,source_id,description,effective_date,actor_name,cash_shift_id,reverses_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        rid,
        sourceType,
        sourceId,
        description,
        date,
        actor.name,
        shiftId ?? null,
        reversesId ?? null,
      ],
    )
  ).rows[0].id;
  for (const line of filtered) {
    const result = await client.query(
      "INSERT INTO finance_lines(restaurant_id,entry_id,account_id,debit_cents,credit_cents) SELECT $1,$2,id,$4,$5 FROM finance_accounts WHERE restaurant_id=$1 AND code=$3",
      [rid, entry, line.code, line.debit || 0, line.credit || 0],
    );
    if (result.rowCount !== 1)
      throw new Error("Conta financeira não configurada.");
  }
  return entry;
}
async function accountBalance(client: PoolClient, rid: string, code: string) {
  return Number(
    (
      await client.query<{ balance: string }>(
        "SELECT COALESCE(sum(l.debit_cents-l.credit_cents),0) AS balance FROM finance_lines l JOIN finance_accounts a ON a.id=l.account_id WHERE a.restaurant_id=$1 AND a.code=$2",
        [rid, code],
      )
    ).rows[0].balance,
  );
}
async function shiftExpected(client: PoolClient, shiftId: string) {
  return Number(
    (
      await client.query<{ expected: string }>(
        `SELECT s.opening_cents+COALESCE((SELECT sum(l.debit_cents-l.credit_cents) FROM finance_lines l JOIN finance_entries e ON e.id=l.entry_id JOIN finance_accounts a ON a.id=l.account_id WHERE e.cash_shift_id=s.id AND a.code='cash' AND e.source_type<>'shift_open'),0) AS expected FROM cash_shifts s WHERE s.id=$1`,
        [shiftId],
      )
    ).rows[0].expected,
  );
}
export async function postSalePayment(
  client: PoolClient,
  rid: string,
  paymentId: string,
  orderId: string,
  method: string,
  amount: number,
  actor: Actor,
) {
  await financeLock(client, rid);
  const shiftId = await openShift(client, rid);
  const order = (
    await client.query<{ served_at: Date | null }>(
      "SELECT served_at FROM orders WHERE id=$1 AND restaurant_id=$2",
      [orderId, rid],
    )
  ).rows[0];
  const code = method === "cash" ? "cash" : method === "pix" ? "bank" : "cards";
  const entryId = await postEntry(
    client,
    rid,
    actor,
    "sale_payment",
    paymentId,
    "Recebimento de venda",
    [
      { code, debit: amount },
      { code: order.served_at ? "receivable" : "advances", credit: amount },
    ],
    businessDate(),
    shiftId,
  );
  await client.query(
    "UPDATE payments SET finance_entry_id=$2,cash_shift_id=$3,received_cents=COALESCE(received_cents,amount_cents) WHERE id=$1",
    [paymentId, entryId, shiftId],
  );
}
export async function recognizeSale(
  client: PoolClient,
  rid: string,
  orderId: string,
  actor: Actor,
) {
  await financeLock(client, rid);
  const order = (
    await client.query<{
      total_cents: number;
      service_cents: number;
      served_at: Date | null;
      order_number: string;
      paid: string;
    }>(
      `SELECT total_cents,service_cents,served_at,order_number,COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id AND status='paid' AND finance_entry_id IS NOT NULL),0) AS paid FROM orders o WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [orderId, rid],
    )
  ).rows[0];
  if (!order || order.served_at) return;
  const paid = Math.min(Number(order.paid), order.total_cents);
  if (order.total_cents > 0)
    await postEntry(
      client,
      rid,
      actor,
      "sale_realized",
      orderId,
      `Venda do pedido #${order.order_number}`,
      [
        { code: "advances", debit: paid },
        { code: "receivable", debit: order.total_cents - paid },
        { code: "sales", credit: order.total_cents - order.service_cents },
        { code: "service_payable", credit: order.service_cents },
      ],
    );
  await client.query("UPDATE orders SET served_at=now() WHERE id=$1", [
    orderId,
  ]);
}
async function reverseEntry(
  client: PoolClient,
  rid: string,
  entryId: string,
  actor: Actor,
  reason: string,
  shiftId?: string,
  effectiveDate = businessDate(),
) {
  const lines = (
    await client.query<{
      code: string;
      debit_cents: string;
      credit_cents: string;
    }>(
      "SELECT a.code,l.debit_cents,l.credit_cents FROM finance_lines l JOIN finance_accounts a ON a.id=l.account_id WHERE l.entry_id=$1 AND l.restaurant_id=$2",
      [entryId, rid],
    )
  ).rows;
  if (!lines.length) throw new Error("Lançamento original não encontrado.");
  const returnedCash = lines
    .filter((l) => l.code === "cash")
    .reduce((sum, l) => sum + Number(l.debit_cents), 0);
  if (shiftId && returnedCash > (await shiftExpected(client, shiftId)))
    throw new Error(
      "Caixa sem dinheiro suficiente para devolver este recebimento.",
    );
  return postEntry(
    client,
    rid,
    actor,
    "reversal",
    entryId,
    reason,
    lines.map((l) => ({
      code: l.code,
      debit: Number(l.credit_cents),
      credit: Number(l.debit_cents),
    })),
    effectiveDate,
    shiftId,
    entryId,
  );
}
export async function financeCommand(
  command: FinanceCommand,
  key: string,
  actor: Actor,
) {
  return transaction(async (client) => {
    const rid = await currentRestaurant(client);
    await financeLock(client, rid);
    const hash = requestHash({ command, actor });
    const prior = (
      await client.query<{ request_hash: string; result: unknown }>(
        "SELECT request_hash,result FROM finance_commands WHERE restaurant_id=$1 AND request_key=$2",
        [rid, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_hash !== hash)
        throw new Error("Esta chave já pertence a outra operação.");
      return prior.result;
    }
    const result = await execute(client, rid, command, key, actor);
    await client.query(
      "INSERT INTO finance_commands(restaurant_id,request_key,request_hash,result) VALUES($1,$2,$3,$4::jsonb)",
      [rid, key, hash, JSON.stringify(result)],
    );
    return result;
  });
}
async function execute(
  client: PoolClient,
  rid: string,
  c: FinanceCommand,
  key: string,
  actor: Actor,
): Promise<Record<string, unknown>> {
  if (!["admin", "manager", "cashier"].includes(actor.role))
    throw new Error("Acesso financeiro necessário.");
  if (
    actor.role === "cashier" &&
    !["open_shift", "close_shift", "cash_move"].includes(c.action)
  )
    throw new Error("Esta ação exige acesso de gestão.");
  if (c.action === "create_series") {
    const amounts = c.mode === "installments" ? installments(c.amountCents, c.count) : Array(c.count).fill(c.amountCents) as number[];
    const seriesId = randomUUID();
    await client.query("INSERT INTO finance_series(id,restaurant_id,mode,title,occurrences,created_by) VALUES($1,$2,$3,$4,$5,$6)",[seriesId,rid,c.mode,c.title,c.count,actor.name]);
    const ids:string[]=[];
    for(let i=0;i<c.count;i++) {
      const result = await execute(client,rid,{action:"create_document",kind:c.kind,title:`${c.title} (${i+1}/${c.count})`,contact:c.contact,category:c.category,amountCents:amounts[i],competenceDate:c.mode==='recurring'?monthlyDate(c.competenceDate,i):c.competenceDate,dueDate:monthlyDate(c.dueDate,i)},key,actor);
      const id=String(result.id);ids.push(id);
      await client.query("UPDATE finance_documents SET series_id=$2,occurrence=$3 WHERE id=$1",[id,seriesId,i+1]);
    }
    return {seriesId,documentIds:ids};
  }
  if(c.action==='stop_series') {
    const series=(await client.query("SELECT mode,stopped_at FROM finance_series WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",[c.seriesId,rid])).rows[0];
    if(!series || series.mode!=='recurring')throw new Error('Recorrência não encontrada.');
    if(series.stopped_at)return {ok:true};
    const docs=(await client.query("SELECT id,entry_id,competence_date::text FROM finance_documents d WHERE series_id=$1 AND restaurant_id=$2 AND cancelled_at IS NULL AND due_date>$3::date AND competence_date>$3::date AND NOT EXISTS(SELECT 1 FROM finance_settlements s WHERE s.document_id=d.id AND reversed_at IS NULL) FOR UPDATE",[c.seriesId,rid,businessDate()])).rows;
    for(const d of docs){await reverseEntry(client,rid,d.entry_id,actor,c.reason,undefined,d.competence_date);await client.query("UPDATE finance_documents SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",[d.id,c.reason]);}
    await client.query("UPDATE finance_series SET stopped_at=now(),stop_reason=$2 WHERE id=$1",[c.seriesId,c.reason]);
    return {ok:true,cancelled:docs.length};
  }
  if(c.action==='create_purchase') {
    if(c.purchasedOn>businessDate())throw new Error('Informe a data da compra confirmada, sem data futura.');
    if(new Set(c.lines.map(l=>l.itemId)).size!==c.lines.length)throw new Error('Não repita o material na compra.');
    if((await client.query("SELECT 1 FROM purchases WHERE restaurant_id=$1 AND supplier=$2 AND reference=$3",[rid,c.supplier,c.reference])).rowCount)throw new Error('Esta referência do fornecedor já está cadastrada.');
    const total=c.lines.reduce((sum,l)=>sum+l.totalCents,0);
    if(total>2_000_000_000)throw new Error('Total da compra excede o limite.');
    const validated=[];
    for(const l of c.lines){const item=(await client.query("SELECT unit FROM inventory_items WHERE id=$1 AND restaurant_id=$2 AND active",[l.itemId,rid])).rows[0];if(!item)throw new Error('Material não encontrado neste restaurante.');validated.push({...l,baseUnit:item.unit,baseQuantity:convertQuantity(l.quantity,l.unit,item.unit)});}
    let seriesId:string;
    if(c.count>1){const result=await execute(client,rid,{action:'create_series',mode:'installments',count:c.count,kind:'payable',title:`Compra ${c.reference}`,contact:c.supplier,category:'stock',amountCents:total,competenceDate:c.purchasedOn,dueDate:c.dueDate},key,actor);seriesId=String(result.seriesId);}
    else {seriesId=randomUUID();await client.query("INSERT INTO finance_series(id,restaurant_id,mode,title,occurrences,created_by) VALUES($1,$2,'installments',$3,1,$4)",[seriesId,rid,`Compra ${c.reference}`,actor.name]);const result=await execute(client,rid,{action:'create_document',kind:'payable',title:`Compra ${c.reference}`,contact:c.supplier,category:'stock',amountCents:total,competenceDate:c.purchasedOn,dueDate:c.dueDate},key,actor);await client.query("UPDATE finance_documents SET series_id=$2,occurrence=1 WHERE id=$1",[result.id,seriesId]);}
    const id=randomUUID();
    await client.query("INSERT INTO purchases(id,restaurant_id,supplier,reference,purchased_on,series_id,total_cents,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,rid,c.supplier,c.reference,c.purchasedOn,seriesId,total,actor.name]);
    for(const l of validated)await client.query("INSERT INTO purchase_lines(restaurant_id,purchase_id,inventory_item_id,input_quantity,input_unit,base_quantity,base_unit,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[rid,id,l.itemId,l.quantity,l.unit,l.baseQuantity,l.baseUnit,l.totalCents]);
    return {id,seriesId};
  }
  if(c.action==='cancel_purchase') {
    const p=(await client.query("SELECT series_id,cancelled_at FROM purchases WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",[c.purchaseId,rid])).rows[0];
    if(!p)throw new Error('Compra não encontrada.');if(p.cancelled_at)return {ok:true};
    if((await client.query("SELECT 1 FROM purchase_lines WHERE purchase_id=$1 AND received_quantity>0",[c.purchaseId])).rowCount)throw new Error('Compra com mercadoria recebida: exige devolução e conferência de estoque.');
    if((await client.query("SELECT 1 FROM finance_documents d JOIN finance_settlements s ON s.document_id=d.id WHERE d.series_id=$1 AND s.reversed_at IS NULL",[p.series_id])).rowCount)throw new Error('Estorne os pagamentos e recebimentos antes de cancelar a compra.');
    const docs=(await client.query("SELECT id,entry_id FROM finance_documents WHERE series_id=$1 AND cancelled_at IS NULL",[p.series_id])).rows;
    for(const d of docs){await reverseEntry(client,rid,d.entry_id,actor,c.reason);await client.query("UPDATE finance_documents SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",[d.id,c.reason]);}
    await client.query("UPDATE purchases SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",[c.purchaseId,c.reason]);return {ok:true};
  }
  if(c.action==='receive_purchase') {
    if(new Set(c.lines.map(l=>l.lineId)).size!==c.lines.length)throw new Error('Não repita o item no recebimento.');
    if(!(await client.query("SELECT id FROM purchases WHERE id=$1 AND restaurant_id=$2 AND cancelled_at IS NULL FOR UPDATE",[c.purchaseId,rid])).rowCount)throw new Error('Compra não encontrada.');
    const changes=[];
    for(const l of c.lines){const row=(await client.query("SELECT * FROM purchase_lines WHERE id=$1 AND purchase_id=$2 AND restaurant_id=$3 FOR UPDATE",[l.lineId,c.purchaseId,rid])).rows[0];if(!row)throw new Error('Item não pertence à compra.');const delta=convertQuantity(l.quantity,l.unit,row.base_unit);if(Math.round((Number(row.received_quantity)+delta)*1000)>Math.round(Number(row.base_quantity)*1000))throw new Error('Recebimento maior que a quantidade pendente.');changes.push({row,delta});}
    changes.sort((a,b)=>String(a.row.inventory_item_id).localeCompare(String(b.row.inventory_item_id)));
    for(const {row,delta} of changes){
      const item=(await client.query("SELECT quantity,average_cost_cents,cost_known,unit FROM inventory_items WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",[row.inventory_item_id,rid])).rows[0];
      if(!item || item.unit!==row.base_unit)throw new Error('Unidade do material mudou. Confira a compra.');
      const before=Number(item.quantity),cost=Number(row.total_cents)/Number(row.base_quantity),quantity=before+delta;
      if(quantity>1_000_000_000)throw new Error('Saldo de estoque excede o limite.');
      const average=(before*Number(item.average_cost_cents)+delta*cost)/quantity;
      await client.query("UPDATE inventory_items SET quantity=$2,average_cost_cents=$3,cost_known=$4,updated_at=now() WHERE id=$1",[row.inventory_item_id,quantity,average,before===0||item.cost_known]);
      await client.query("UPDATE purchase_lines SET received_quantity=received_quantity+$2 WHERE id=$1",[row.id,delta]);
      await client.query("INSERT INTO inventory_movements(restaurant_id,inventory_item_id,type,quantity_delta,unit_cost_cents,note,purchase_line_id) VALUES($1,$2,'purchase',$3,$4,$5,$6)",[rid,row.inventory_item_id,delta,cost,`Compra ${c.purchaseId} · recebido por ${actor.name}`,row.id]);
    }
    return {ok:true};
  }
  if (c.action === "open_shift") {
    if (
      (
        await client.query(
          "SELECT 1 FROM cash_shifts WHERE restaurant_id=$1 AND closed_at IS NULL",
          [rid],
        )
      ).rowCount
    )
      throw new Error("Já existe um caixa aberto.");
    const shift = (
      await client.query<{ id: string }>(
        "INSERT INTO cash_shifts(restaurant_id,opened_by,opening_cents) VALUES($1,$2,$3) RETURNING id",
        [rid, actor.name, c.openingCents],
      )
    ).rows[0];
    const priorBalance = await accountBalance(client, rid, "cash");
    const difference = c.openingCents - priorBalance;
    if (difference !== 0)
      await postEntry(
        client,
        rid,
        actor,
        "shift_open",
        shift.id,
        "Conferência do fundo inicial",
        difference > 0
          ? [
              { code: "cash", debit: difference },
              { code: "equity", credit: difference },
            ]
          : [
              { code: "equity", debit: -difference },
              { code: "cash", credit: -difference },
            ],
        businessDate(),
        shift.id,
      );
    return { id: shift.id };
  }
  if (c.action === "close_shift") {
    if ((await openShift(client, rid)) !== c.shiftId)
      throw new Error("Caixa não está aberto.");
    const expected = await shiftExpected(client, c.shiftId);
    const difference = c.countedCents - expected;
    if (difference !== 0 && !c.note.trim())
      throw new Error("Explique a diferença da contagem.");
    await client.query(
      "UPDATE cash_shifts SET closed_at=now(),closed_by=$2,counted_cents=$3,expected_cents=$4,closing_note=$5 WHERE id=$1",
      [c.shiftId, actor.name, c.countedCents, expected, c.note],
    );
    return { expectedCents: expected, differenceCents: difference };
  }
  if (c.action === "cash_move") {
    const shift = await openShift(client, rid);
    if (
      c.kind === "withdrawal" &&
      (await shiftExpected(client, shift)) < c.amountCents
    )
      throw new Error("Sangria maior que o saldo esperado.");
    await postEntry(
      client,
      rid,
      actor,
      "cash_move",
      key,
      c.description,
      c.kind === "topup"
        ? [
            { code: "cash", debit: c.amountCents },
            { code: "bank", credit: c.amountCents },
          ]
        : [
            { code: "bank", debit: c.amountCents },
            { code: "cash", credit: c.amountCents },
          ],
      businessDate(),
      shift,
    );
    return { ok: true };
  }
  if (c.action === "opening_bank") {
    if((await client.query("SELECT 1 FROM finance_entries WHERE restaurant_id=$1 AND source_type='bank_opening'",[rid])).rowCount)throw new Error("O saldo bancário inicial já foi registrado.");
    await postEntry(
      client,
      rid,
      actor,
      "bank_opening",
      "initial",
      c.description,
      [
        { code: "bank", debit: c.amountCents },
        { code: "equity", credit: c.amountCents },
      ],
    );
    return { ok: true };
  }
  if (c.action === "create_document") {
    if ((c.kind === "receivable") !== (c.category === "other_income"))
      throw new Error(
        "Selecione uma categoria compatível com o tipo da conta.",
      );
    const id = randomUUID();
    const entryId = await postEntry(
      client,
      rid,
      actor,
      "document",
      id,
      c.title,
      c.kind === "payable"
        ? [
            { code: c.category, debit: c.amountCents },
            { code: "payable", credit: c.amountCents },
          ]
        : [
            { code: "other_receivable", debit: c.amountCents },
            { code: "other_income", credit: c.amountCents },
          ],
      c.competenceDate,
    );
    await client.query(
      "INSERT INTO finance_documents(id,restaurant_id,kind,title,contact,category,amount_cents,competence_date,due_date,created_by,entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        rid,
        c.kind,
        c.title,
        c.contact,
        c.category,
        c.amountCents,
        c.competenceDate,
        c.dueDate,
        actor.name,
        entryId,
      ],
    );
    return { id };
  }
  if (c.action === "settle_document") {
    if (c.paidOn > businessDate())
      throw new Error("Informe uma data de pagamento ou recebimento que não esteja no futuro.");
    const doc = (
      await client.query<{
        kind: string;
        title: string;
        amount_cents: string;
        paid: string;
      }>(
        `SELECT d.kind,d.title,d.amount_cents,COALESCE((SELECT sum(amount_cents) FROM finance_settlements s WHERE s.document_id=d.id AND reversed_at IS NULL),0) AS paid FROM finance_documents d WHERE id=$1 AND restaurant_id=$2 AND cancelled_at IS NULL FOR UPDATE`,
        [c.documentId, rid],
      )
    ).rows[0];
    if (!doc || c.amountCents > Number(doc.amount_cents) - Number(doc.paid))
      throw new Error("Valor maior que o saldo da conta ou conta encerrada.");
    const shift =
      c.account === "cash" ? await openShift(client, rid) : undefined;
    if (shift && c.paidOn !== businessDate())
      throw new Error("Movimento em dinheiro deve pertencer ao caixa de hoje.");
    if (
      shift &&
      doc.kind === "payable" &&
      (await shiftExpected(client, shift)) < c.amountCents
    )
      throw new Error("Dinheiro insuficiente no caixa.");
    const id = randomUUID();
    const entry = await postEntry(
      client,
      rid,
      actor,
      "document_settlement",
      id,
      `Baixa: ${doc.title}`,
      doc.kind === "payable"
        ? [
            { code: "payable", debit: c.amountCents },
            { code: c.account, credit: c.amountCents },
          ]
        : [
            { code: c.account, debit: c.amountCents },
            { code: "other_receivable", credit: c.amountCents },
          ],
      c.paidOn,
      shift,
    );
    await client.query(
      "INSERT INTO finance_settlements(id,restaurant_id,document_id,amount_cents,paid_on,account_code,entry_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, rid, c.documentId, c.amountCents, c.paidOn, c.account, entry],
    );
    return { id };
  }
  if (c.action === "reverse_settlement") {
    const settlement = (
      await client.query<{ entry_id: string; account_code: string }>(
        "SELECT entry_id,account_code FROM finance_settlements WHERE id=$1 AND restaurant_id=$2 AND reversed_at IS NULL FOR UPDATE",
        [c.settlementId, rid],
      )
    ).rows[0];
    if (!settlement) throw new Error("Pagamento ou recebimento não encontrado ou já estornado.");
    const shift =
      settlement.account_code === "cash"
        ? await openShift(client, rid)
        : undefined;
    await reverseEntry(
      client,
      rid,
      settlement.entry_id,
      actor,
      c.reason,
      shift,
    );
    await client.query(
      "UPDATE finance_settlements SET reversed_at=now(),reversal_reason=$2 WHERE id=$1",
      [c.settlementId, c.reason],
    );
    return { ok: true };
  }
  if (c.action === "cancel_document") {
    if((await client.query("SELECT 1 FROM purchases p JOIN finance_documents d ON d.series_id=p.series_id WHERE d.id=$1 AND p.restaurant_id=$2",[c.documentId,rid])).rowCount)throw new Error('Conta vinculada a compra: cancelamento exige conferência da mercadoria e ajuste da compra.');
    const doc = (
      await client.query<{ entry_id: string; competence_date: string }>(
        "SELECT entry_id,competence_date::text FROM finance_documents d WHERE id=$1 AND restaurant_id=$2 AND cancelled_at IS NULL AND NOT EXISTS(SELECT 1 FROM finance_settlements s WHERE s.document_id=d.id AND s.reversed_at IS NULL) FOR UPDATE",
        [c.documentId, rid],
      )
    ).rows[0];
    if (!doc) throw new Error("Estorne os pagamentos e recebimentos antes de cancelar a conta.");
    await reverseEntry(client, rid, doc.entry_id, actor, c.reason, undefined, doc.competence_date > businessDate() ? doc.competence_date : businessDate());
    await client.query(
      "UPDATE finance_documents SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",
      [c.documentId, c.reason],
    );
    return { ok: true };
  }
  if (c.action === "reconcile_card") {
    if (c.paidOn > businessDate())
      throw new Error("Informe a data efetiva do crédito.");
    const payment = (
      await client.query<{
        amount_cents: number;
        order_number: string;
        received_on: string;
      }>(
        "SELECT p.amount_cents,o.order_number,(p.paid_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS received_on FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.restaurant_id=$2 AND p.method IN ('credit','debit') AND p.status='paid' AND p.finance_entry_id IS NOT NULL AND p.reconciliation_entry_id IS NULL FOR UPDATE OF p",
        [c.paymentId, rid],
      )
    ).rows[0];
    if (payment && c.paidOn < payment.received_on)
      throw new Error("O crédito não pode anteceder o recebimento do cartão.");
    if (!payment || c.netCents > payment.amount_cents)
      throw new Error("Recebimento indisponível ou líquido maior que o bruto.");
    const entry = await postEntry(
      client,
      rid,
      actor,
      "card_settlement",
      c.paymentId,
      c.reference,
      [
        { code: "bank", debit: c.netCents },
        { code: "fees", debit: payment.amount_cents - c.netCents },
        { code: "cards", credit: payment.amount_cents },
      ],
      c.paidOn,
    );
    await client.query(
      "UPDATE payments SET reconciliation_entry_id=$2 WHERE id=$1",
      [c.paymentId, entry],
    );
    return { ok: true };
  }
  if (c.action === "service_payout") {
    const available = -(await accountBalance(client, rid, "service_payable"));
    if (c.amountCents > available)
      throw new Error("Repasse maior que a taxa de serviço acumulada.");
    const shift =
      c.account === "cash" ? await openShift(client, rid) : undefined;
    if (shift && c.amountCents > (await shiftExpected(client, shift)))
      throw new Error("Dinheiro insuficiente para este repasse.");
    await postEntry(
      client,
      rid,
      actor,
      "service_payout",
      key,
      c.description,
      [
        { code: "service_payable", debit: c.amountCents },
        { code: c.account, credit: c.amountCents },
      ],
      businessDate(),
      shift,
    );
    return { ok: true };
  }
  throw new Error("Operação financeira desconhecida.");
}
