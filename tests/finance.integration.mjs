import assert from "node:assert/strict";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { connect } from "../scripts/database.mjs";
const db = await connect();
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const prefix = `QA-FIN-${randomUUID().slice(0, 8)}`;
const staff = randomUUID(),
  product = randomUUID(),
  variant = randomUUID(),
  table = randomUUID();
let cookie, rid, shift;
const orders = [];
const requestKeys = new Set();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
async function call(path, body, key = randomUUID(), method = "POST") {
  if (method === "POST") requestKeys.add(key);
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  return {
    status: r.status,
    body: result,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function ok(path, body, key) {
  const r = await call(path, body, key);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const command = (body, key) => ok("/api/operations/finance", body, key);
try {
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Teste permitido somente contra servidor local.");
  rid = (
    await db.query("SELECT id FROM restaurants WHERE slug=$1", [
      process.env.RESTAURANT_SLUG || "patos-lanches",
    ])
  ).rows[0].id;
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM cash_shifts WHERE restaurant_id=$1 AND closed_at IS NULL",
        [rid],
      )
    ).rows[0].n,
    0,
    "Test requires no open operational shift; refusing to modify it.",
  );
  const pin = randomBytes(3)
      .readUIntBE(0, 3)
      .toString()
      .slice(0, 6)
      .padStart(6, "0"),
    salt = randomBytes(16).toString("hex");
  await db.query(
    "INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,'manager',$4,$5)",
    [staff, rid, prefix, salt, scryptSync(pin, salt, 64).toString("hex")],
  );
  cookie = (await call("/api/auth/login", { username: prefix, password: pin }))
    .cookie;
  assert.ok(cookie);
  await db.query(
    "INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,'QA','QA')",
    [product, rid, prefix],
  );
  await db.query(
    "INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'QA',1000)",
    [variant, product],
  );
  const tableNumber = (
    await db.query(
      "SELECT n FROM generate_series(190,200) n WHERE NOT EXISTS(SELECT 1 FROM dining_tables WHERE number=n AND restaurant_id=$1) LIMIT 1",
      [rid],
    )
  ).rows[0]?.n;
  assert.ok(tableNumber);
  await db.query(
    "INSERT INTO dining_tables(id,restaurant_id,number,label) VALUES($1,$2,$3,$4)",
    [table, rid, tableNumber, prefix],
  );
  const opened = await command({ action: "open_shift", openingCents: 10000 });
  shift = opened.id;
  const payKey = randomUUID();
  const made = await call("/api/operations/orders", {
    tableNumber,
    sendToKitchen: true,
    items: [{ productId: product, variantId: variant, quantity: 1 }],
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.order.id;
  orders.push(id);
  const order = (
    await db.query("SELECT total_cents FROM orders WHERE id=$1", [id])
  ).rows[0];
  assert.equal(
    (
      await call("/api/operations/payments", {
        tableNumber,
        payments: [{ method: "Crédito", amountCents: order.total_cents + 1 }],
      })
    ).status,
    400,
  );
  const receipt = await ok(
    "/api/operations/payments",
    { tableNumber, payments: [{ method: "Dinheiro", amountCents: 2000 }] },
    payKey,
  );
  assert.equal(receipt.changeCents, 2000 - order.total_cents);
  assert.equal(
    (await db.query("SELECT status FROM orders WHERE id=$1", [id])).rows[0]
      .status,
    "confirmed",
    "Payment must not finish production",
  );
  assert.deepEqual(
    await ok(
      "/api/operations/payments",
      { tableNumber, payments: [{ method: "Dinheiro", amountCents: 2000 }] },
      payKey,
    ),
    receipt,
  );
  const ticket = (
    await db.query("SELECT id FROM kitchen_tickets WHERE order_id=$1", [id])
  ).rows[0].id;
  assert.equal(
    (
      await call(
        `/api/internal/kitchen/${ticket}`,
        { status: "ready" },
        randomUUID(),
        "PATCH",
      )
    ).status,
    200,
  );
  await ok(`/api/operations/orders/${id}/serve`, {});
  assert.equal(
    (await db.query("SELECT status FROM orders WHERE id=$1", [id])).rows[0]
      .status,
    "completed",
  );
  const creditedSales=(await db.query("SELECT a.code,sum(l.credit_cents)::int AS amount FROM finance_entries e JOIN finance_lines l ON l.entry_id=e.id JOIN finance_accounts a ON a.id=l.account_id WHERE e.source_type='sale_realized' AND e.source_id=$1 GROUP BY a.code",[id])).rows;
  assert.equal(creditedSales.find(row=>row.code==='sales').amount,1000);
  const serviceCharge=order.total_cents-1000;
  if(serviceCharge>0){assert.equal(creditedSales.find(row=>row.code==='service_payable').amount,serviceCharge);await command({action:'service_payout',amountCents:serviceCharge,account:'bank',description:prefix});}
  const bankOpeningExists=(await db.query("SELECT 1 FROM finance_entries WHERE restaurant_id=$1 AND source_type='bank_opening'",[rid])).rowCount;
  if(!bankOpeningExists)await command({action:'opening_bank',amountCents:100000,description:prefix});
  assert.equal((await call('/api/operations/finance',{action:'opening_bank',amountCents:100000,description:prefix})).status,400);
  const documentPayload = {
    action: "create_document",
    kind: "payable",
    title: prefix,
    contact: "Fornecedor QA",
    category: "operating",
    amountCents: 1500,
    competenceDate: day,
    dueDate: day,
  };
  const docKey = randomUUID();
  const [d1, d2] = await Promise.all([
    command(documentPayload, docKey),
    command(documentPayload, docKey),
  ]);
  assert.equal(d1.id, d2.id);
  const settled = await command({
    action: "settle_document",
    documentId: d1.id,
    amountCents: 500,
    paidOn: day,
    account: "bank",
  });
  assert.equal(
    (
      await call("/api/operations/finance", {
        action: "settle_document",
        documentId: d1.id,
        amountCents: 1001,
        paidOn: day,
        account: "bank",
      })
    ).status,
    400,
  );
  await command({
    action: "reverse_settlement",
    settlementId: settled.id,
    reason: "QA estorno da baixa",
  });
  const data = await call("/api/operations/finance", null, randomUUID(), "GET");
  assert.equal(data.status, 200, JSON.stringify(data.body));
  assert.equal(
    Number(data.body.documents.find((d) => d.id === d1.id).paid_cents),
    0,
  );
  await command({
    action: "cancel_document",
    documentId: d1.id,
    reason: "QA cancelamento",
  });
  const cardOrder = await call("/api/public/orders", {
    source: "public_menu",
    fulfillment: "pickup",
    customer: { name: prefix },
    items: [{ productId: product, variantId: variant, quantity: 1 }],
  });
  assert.equal(cardOrder.status, 201);
  const cardOrderId = cardOrder.body.order.id;
  orders.push(cardOrderId);
  await ok(`/api/operations/orders/${cardOrderId}/approval`, {
    decision: "approve",
    revision: 1,
  });
  const cardTicket = (
    await db.query("SELECT id FROM kitchen_tickets WHERE order_id=$1", [
      cardOrderId,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await call(
        `/api/internal/kitchen/${cardTicket}`,
        { status: "ready" },
        randomUUID(),
        "PATCH",
      )
    ).status,
    200,
  );
  await ok(`/api/operations/orders/${cardOrderId}/payment`, {
    method: "Crédito",
  });
  const cardPayment = (
    await db.query("SELECT id FROM payments WHERE order_id=$1", [cardOrderId])
  ).rows[0].id;
  const reconcileKey = randomUUID();
  const reconciliation = {
    action: "reconcile_card",
    paymentId: cardPayment,
    netCents: 970,
    paidOn: day,
    reference: prefix,
  };
  await command(reconciliation, reconcileKey);
  await command(reconciliation, reconcileKey);
  assert.equal(
    (await call("/api/operations/finance", reconciliation)).status,
    400,
  );
  await db.query("BEGIN");
  try {
    const entry = (
      await db.query(
        "INSERT INTO finance_entries(restaurant_id,source_type,source_id,description,effective_date,actor_name) VALUES($1,'qa_unbalanced',$2,$2,$3,$2) RETURNING id",
        [rid, prefix, day],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO finance_lines(restaurant_id,entry_id,account_id,debit_cents) SELECT $1,$2,id,100 FROM finance_accounts WHERE restaurant_id=$1 AND code='cash'",
      [rid, entry],
    );
    await assert.rejects(db.query("COMMIT"), /desequilibrado/);
  } finally {
    await db.query("ROLLBACK");
  }
  await ok(`/api/operations/orders/${cardOrderId}/refund`, {
    reason: "QA devolução confirmada",
    confirmedReturned: true,
  });
  assert.equal(
    (await db.query("SELECT status FROM orders WHERE id=$1", [cardOrderId]))
      .rows[0].status,
    "cancelled",
  );
  assert.equal(
    (await db.query("SELECT status FROM payments WHERE id=$1", [cardPayment]))
      .rows[0].status,
    "refunded",
  );
  await ok(`/api/operations/orders/${cardOrderId}/refund`, {
    reason: "QA devolução confirmada",
    confirmedReturned: true,
  });
  await command({
    action: "cash_move",
    kind: "withdrawal",
    amountCents: 500,
    description: prefix,
  });
  const expected = 10000 + order.total_cents - 500;
  const close = await command({
    action: "close_shift",
    shiftId: shift,
    countedCents: expected,
    note: "QA conferido",
  });
  assert.equal(close.expectedCents, expected);
  assert.equal(close.differenceCents, 0);
  const unbalanced = (
    await db.query(
      "SELECT e.id FROM finance_entries e LEFT JOIN finance_lines l ON l.entry_id=e.id WHERE e.actor_name=$1 GROUP BY e.id HAVING sum(l.debit_cents-l.credit_cents)<>0 OR count(l.id)<2",
      [prefix],
    )
  ).rows;
  assert.equal(unbalanced.length, 0);
  await db.query(`WITH created AS(INSERT INTO finance_entries(restaurant_id,source_type,source_id,description,effective_date,actor_name) SELECT $1,'qa_bulk',$2||':'||n,$2||'-BULK',$3,$2 FROM generate_series(1,205) n RETURNING id,restaurant_id) INSERT INTO finance_lines(restaurant_id,entry_id,account_id,debit_cents,credit_cents) SELECT c.restaurant_id,c.id,a.id,CASE WHEN a.code='bank' THEN 1 ELSE 0 END,CASE WHEN a.code='equity' THEN 1 ELSE 0 END FROM created c JOIN finance_accounts a ON a.restaurant_id=c.restaurant_id AND a.code IN('bank','equity')`,[rid,prefix,day]);
  const exported = await fetch(
    `${base}/api/operations/finance/export?from=${day}&to=${day}`,
    { headers: { cookie } },
  );
  assert.equal(exported.status, 200);
  const csv=await exported.text();
  assert.match(csv, /Débito \(centavos\)/);
  assert.equal(csv.split('\r\n').filter(line=>line.includes(prefix+'-BULK')).length,410,'Export must contain every posting beyond the UI limit');
  console.log(
    "PASS: cash shift, cash-only change, payment before preparation, idempotent receipt, fulfillment, concurrent document creation, partial settlement, excess rejection, reversal, cancellation, withdrawal, close, balanced journal, card reconciliation, full refund and full CSV.",
  );
} finally {
  // Delete only this run's explicitly identified synthetic records, never old business records.
  await db.query("BEGIN");
  try {
    await db.query(
      "DELETE FROM finance_settlements WHERE document_id IN(SELECT id FROM finance_documents WHERE created_by=$1)",
      [prefix],
    );
    await db.query("DELETE FROM finance_documents WHERE created_by=$1", [
      prefix,
    ]);
    if (orders.length) {
      await db.query("DELETE FROM payments WHERE order_id=ANY($1::uuid[])", [
        orders,
      ]);
      await db.query(
        "DELETE FROM inventory_movements WHERE order_id=ANY($1::uuid[])",
        [orders],
      );
      await db.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [orders]);
    }
    await db.query(
      "DELETE FROM finance_commands WHERE restaurant_id=$1 AND result->>'id' IN(SELECT id::text FROM cash_shifts WHERE opened_by=$2)",
      [rid, prefix],
    );
    await db.query(
      "DELETE FROM finance_commands WHERE restaurant_id=$1 AND request_key=ANY($2::uuid[])",
      [rid, [...requestKeys]],
    );
    await db.query("DELETE FROM finance_entries WHERE actor_name=$1", [prefix]);
    await db.query("DELETE FROM cash_shifts WHERE opened_by=$1", [prefix]);
    await db.query("DELETE FROM menu_products WHERE id=$1", [product]);
    await db.query("DELETE FROM dining_tables WHERE id=$1", [table]);
    await db.query("DELETE FROM staff_members WHERE id=$1", [staff]);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}
