import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connect } from "../scripts/database.mjs";
import {
  createCoreFixture,
  cleanupCoreFixture,
} from "./helpers/core-fixture.mjs";
import "./helpers/typescript-source.mjs";
const fiscal = await import("../modules/fiscal/service.ts");
const { collectFiles, focusFileUrl } = await import(
  "../modules/fiscal/resources.ts"
);
const { exportFiscal } = await import("../modules/fiscal/export.ts");
const { processFiscalQueue } = await import("../modules/fiscal/worker.ts");
const { emptyIssuer, emptyTax } = await import("../modules/fiscal/schema.ts");
const { database } = await import("../lib/database.ts");
const db = await connect(),
  originalFetch = globalThis.fetch,
  actor = { role: "manager", name: "QA fiscal activation" };
assert.ok(
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
  "This test requires an isolated local database",
);
let q,
  other,
  network = 0;
const replies = new Map();
let lost = true,
  missingCancel = false,
  failFiles = false,
  mismatchedProtocol = false;
function entries(zip) {
  const out = {};
  for (let n = 0; zip.readUInt32LE(n) === 0x04034b50; ) {
    const size = zip.readUInt32LE(n + 18),
      length = zip.readUInt16LE(n + 26),
      extra = zip.readUInt16LE(n + 28),
      start = n + 30 + length + extra;
    out[zip.subarray(n + 30, n + 30 + length).toString()] = zip.subarray(
      start,
      start + size,
    );
    n = start + size;
  }
  return out;
}
try {
  q = await createCoreFixture(db, "FISCAL-ACTIVATION");
  other = await createCoreFixture(db, "FISCAL-ISOLATION");
  const issuer = {
    ...emptyIssuer,
    cnpj: "12345678000123",
    legalName: "QA",
    ie: "123",
    regime: "1",
    accountant: "QA",
    reviewed: true,
    presentialApproved: true,
    servicePolicy: "other_expense",
    discountsApproved: true,
  };
  const tax = {
    ...emptyTax,
    ncm: "19059090",
    cfop: "5102",
    origin: "0",
    icms: "102",
    pis: "07",
    cofins: "07",
    reviewed: true,
    addonsPolicy: "include",
  };
  await fiscal.saveIssuer(q.id, issuer, actor);
  await fiscal.saveTax(q.id, q.products[0].id, tax, actor);
  const group = randomUUID();
  const sales = [];
  for (let n = 1; n <= 3; n++) {
    const id = randomUUID();
    sales.push(id);
    await db.query(
      "INSERT INTO orders(id,restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,checkout_group_id,subtotal_cents,service_cents,total_cents) VALUES($1,$2,$3,$3,'waiter','dine_in','completed',$4,$5,1200,120,1320)",
      [id, q.id, n, q.table, n <= 2 ? group : randomUUID()],
    );
    await db.query(
      "INSERT INTO order_items(order_id,product_id,variant_id,product_name,variant_name,kitchen_sector,quantity,unit_price_cents,addons) VALUES($1,$2,$3,'QA','Individual','Cozinha',1,1000,'[{\"name\":\"Extra\",\"priceCents\":200}]')",
      [id, q.products[0].id, q.products[0].variant],
    );
    await db.query(
      "INSERT INTO payments(order_id,method,amount_cents,received_cents,change_cents,status,paid_at) VALUES($1,'cash',1320,2000,680,'paid',now())",
      [id],
    );
  }
  await assert.rejects(
    () =>
      fiscal.prepareDocument(q.id, [sales[0], sales[2]], randomUUID(), actor),
    /mesmo fechamento/,
  );
  const requestKey = randomUUID();
  const pair = await Promise.all([
    fiscal.prepareDocument(q.id, sales.slice(0, 2), requestKey, actor),
    fiscal.prepareDocument(q.id, sales.slice(0, 2), requestKey, actor),
  ]);
  assert.equal(pair[0].id, pair[1].id);
  const id = pair[0].id;
  const production = await fiscal.prepareDocument(
    q.id,
    sales.slice(0, 2),
    requestKey,
    actor,
    "production",
  );
  assert.notEqual(production.id, id);
  assert.equal(
    (await fiscal.fiscalOverview(q.id, "production")).documents.length,
    1,
  );
  await assert.rejects(
    () => fiscal.refreshDocument(other.id, id, actor),
    /não encontrado/,
  );
  globalThis.fetch = async (input, init = {}) => {
    network++;
    const url = new URL(input);
    assert.equal(
      url.origin,
      "https://homologacao.focusnfe.com.br",
      "No live production request permitted",
    );
    if (url.pathname.startsWith("/arquivos/")) {
      if (failFiles) return new Response("unavailable", { status: 503 });
      return new Response(
        `<nfeProc><NFe><infNFe Id="NFe${"31261012345678000123650010000000421000000010"}"><emit><CNPJ>12345678000123</CNPJ></emit></infNFe></NFe><protNFe><infProt><chNFe>${"31261012345678000123650010000000421000000010"}</chNFe><cStat>100</cStat><nProt>${mismatchedProtocol ? "999999999999999" : "123456789012345"}</nProt></infProt></protNFe></nfeProc>`,
      );
    }
    if (url.pathname.startsWith("/notas_fiscais_consumidor/"))
      return new Response(
        '<!doctype html><html><body><h1>QA sem validade fiscal</h1><script>throw new Error("must be sandboxed")</script></body></html>',
      );
    const reference =
      url.searchParams.get("ref") || url.pathname.split("/").pop();
    if (init.method === "POST") {
      assert.ok(!replies.has(reference), "No duplicate POST after timeout");
      const body = JSON.parse(init.body);
      assert.equal(body.valor_troco, "13.60");
      assert.equal(body.items.length, 2);
      replies.set(reference, {
        status: "autorizado",
        ref: reference,
        cnpj_emitente: issuer.cnpj,
        chave_nfe: "31261012345678000123650010000000421000000010",
        numero: "42",
        serie: "1",
        numero_protocolo: "123456789012345",
        caminho_xml_nota_fiscal: "/arquivos/qa.xml",
        caminho_danfe: "/notas_fiscais_consumidor/qa.html",
      });
      if (lost) {
        lost = false;
        throw new Error("Synthetic connection lost after authorization");
      }
    }
    if (init.method === "DELETE")
      replies.set(reference, {
        ...replies.get(reference),
        status: "cancelado",
        ...(!missingCancel
          ? { caminho_xml_cancelamento: "/arquivos/cancel.xml" }
          : {}),
      });
    return Response.json(
      replies.get(reference) || { status: "processando_autorizacao" },
    );
  };
  delete process.env.FOCUS_NFE_PRODUCTION_ENABLED;
  await assert.rejects(
    () => fiscal.processDocument(q.id, production.id, actor),
    /desabilitado/,
  );
  assert.equal(network, 0);
  process.env.FOCUS_NFE_HOMOLOGATION_ENABLED = "true";
  process.env.FOCUS_NFE_HOMOLOGATION_TOKENS = JSON.stringify({
    [q.id]: "synthetic-only",
  });
  assert.equal(
    (await fiscal.processDocument(q.id, id, actor)).status,
    "unknown",
  );
  await db.query(
    "UPDATE integration_operations SET lease_until=now()-interval '1 second' WHERE restaurant_id=$1",
    [q.id],
  );
  assert.equal((await processFiscalQueue()).processed, 1);
  assert.equal(replies.size, 1);
  const doc = (await fiscal.fiscalOverview(q.id)).documents[0];
  assert.equal(doc.status, "succeeded");
  assert.equal(doc.result.fiscal.number, "42");
  assert.equal(doc.result.fiscal.protocol, "123456789012345");
  assert.ok(doc.issued_at);
  failFiles = true;
  assert.ok((await collectFiles(q.id, id)).missing.includes("xml"));
  failFiles = false;
  assert.deepEqual((await collectFiles(q.id, id)).saved, ["xml", "auxiliary"]);
  mismatchedProtocol = true;
  assert.ok((await collectFiles(q.id, id)).missing.includes("xml"));
  assert.equal(
    (await fiscal.fiscalOverview(q.id)).documents[0].result.fiscal.protocol,
    "123456789012345",
    "Divergent XML cannot overwrite authorization",
  );
  mismatchedProtocol = false;
  assert.equal(
    (
      await db.query(
        "SELECT mime FROM fiscal_files WHERE document_id=$1 AND kind='auxiliary'",
        [id],
      )
    ).rows[0].mime,
    "text/html",
  );
  await assert.rejects(
    () => fiscal.refreshDocument(q.id, id, actor),
    /não pode ser alterado/,
  );
  assert.throws(() =>
    focusFileUrl("https://api.focusnfe.com.br/arquivos/qa.xml", "homologation"),
  );
  assert.throws(() =>
    focusFileUrl("/notas_fiscais_consumidor/../../v2/empresas"),
  );
  await db.query(
    "UPDATE fiscal_documents SET issued_at=now()-interval '40 days',created_at=now()-interval '40 days' WHERE id=$1",
    [id],
  );
  missingCancel = true;
  assert.equal(
    (
      await fiscal.cancelDocument(
        q.id,
        id,
        "Cancelamento sintético para teste de evento",
        actor,
      )
    ).status,
    "succeeded",
  );
  const period = {
    from: new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    }),
    to: new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    }),
  };
  const exported = entries(
    await exportFiscal(db, q.id, "homologation", period, "QA"),
  );
  const index = JSON.parse(exported["indice.json"]);
  assert.equal(
    index.documents.length,
    1,
    "Cancellation in period must include old invoice",
  );
  assert.equal(index.documents[0].status, "cancelled");
  assert.equal(
    index.incomplete,
    true,
    "Missing cancellation XML is incomplete",
  );
  assert.ok(exported["indice.csv"].includes(Buffer.from("123456789012345")));
  const prodIndex = JSON.parse(
    entries(await exportFiscal(db, q.id, "production", period, "QA"))[
      "indice.json"
    ],
  );
  assert.equal(prodIndex.documents.length, 1);
  assert.equal(prodIndex.documents[0].id, production.id);
  assert.equal(prodIndex.documents[0].status, "draft");
  assert.equal(prodIndex.documents[0].files.length, 0);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM payments WHERE order_id=ANY($1::uuid[])",
        [sales],
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1",
        [q.id],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS: local SQL migration, same-account grouping, parallel idempotency, environment isolation, disabled-production zero network, timeout→worker consultation, normalized metadata, file retry/HTML, prior-month cancellation export + CSV + missing XML, unchanged receipts. No Focus network.",
  );
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.FOCUS_NFE_HOMOLOGATION_ENABLED;
  delete process.env.FOCUS_NFE_HOMOLOGATION_TOKENS;
  if (q) await cleanupCoreFixture(db, q);
  if (other) await cleanupCoreFixture(db, other);
  await db.end();
  await database.end();
}
