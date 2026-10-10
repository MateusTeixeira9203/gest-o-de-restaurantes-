import assert from "node:assert/strict";
import { buildFiscal } from "../modules/fiscal/builder.ts";
import {
  emptyIssuer,
  emptyTax,
  emptyOptions,
  optionsSchema,
} from "../modules/fiscal/schema.ts";
import { allocate, percent } from "../modules/fiscal/money.ts";
import { focusProvider } from "../modules/fiscal/focus.ts";
import { validateFiscalXml } from "../modules/fiscal/xml.ts";
import { focusAvailability } from "../modules/fiscal/config.ts";
assert.throws(
  () =>
    validateFiscalXml(
      Buffer.from("<QA>" + "1".repeat(44) + "</QA>"),
      "1".repeat(44),
      "12345678000123",
      "xml",
    ),
  /autorização/,
);
assert.throws(
  () =>
    validateFiscalXml(
      Buffer.from(
        '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',
      ),
      "1".repeat(44),
      "12345678000123",
      "xml",
    ),
  /XML inválido/,
);
const issuer = {
  ...emptyIssuer,
  cnpj: "12345678000123",
  legalName: "QA",
  ie: "1",
  regime: "1",
  accountant: "QA",
  reviewed: true,
  presentialApproved: true,
  servicePolicy: "other_expense",
  freightApproved: true,
  discountsApproved: true,
};
const sale = {
  id: "a",
  order_number: "1",
  source: "waiter",
  fulfillment: "dine_in",
  status: "completed",
  subtotal_cents: 2400,
  total_cents: 2541,
  service_cents: 240,
  delivery_fee_cents: 0,
};
const item = {
  id: "i",
  order_id: "a",
  product_id: "p",
  product_name: "QA",
  variant_name: "Un",
  quantity: 2,
  unit_price_cents: 1000,
  addons: [{ name: "Extra", priceCents: 200 }],
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
const receipts = [
  {
    order_id: "a",
    method: "pix",
    amount_cents: 1541,
    received_cents: 1541,
    change_cents: 0,
  },
  {
    order_id: "a",
    method: "cash",
    amount_cents: 1000,
    received_cents: 2000,
    change_cents: 1000,
  },
];
const result = buildFiscal(issuer, [sale], [item], receipts, { p: tax });
assert.deepEqual(result.blockers, []);
assert.equal(result.payload.items[0].valor_bruto, "24.00");
assert.equal(result.payload.items[0].valor_outras_despesas, "2.40");
assert.equal(result.payload.items[0].valor_desconto, "0.99");
assert.equal(result.payload.valor_troco, "10.00");
assert.equal(result.payload.formas_pagamento[1].valor_pagamento, "20.00");
for (let cents = 0; cents < 200; cents++) {
  const parts = allocate(cents, [333, 333, 334]);
  assert.equal(
    parts.reduce((a, b) => a + b, 0),
    cents,
  );
  assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
}
assert.equal(percent(999, "18"), 180);
assert.equal(percent(5, "10"), 1);
assert.ok(
  buildFiscal(issuer, [sale, { ...sale, id: "b" }], [item], receipts, {
    p: tax,
  }).blockers.some((b) => b.includes("mesmo fechamento")),
);
const regular = buildFiscal(
  { ...issuer, regime: "3" },
  [sale],
  [item],
  receipts,
  {
    p: {
      ...tax,
      icms: "20",
      icmsRate: "18",
      icmsReduction: "50",
      pis: "01",
      pisRate: "1.65",
      cofins: "01",
      cofinsRate: "7.6",
    },
  },
);
assert.deepEqual(regular.blockers, []);
assert.equal(regular.payload.items[0].icms_base_calculo, "12.70");
assert.equal(regular.payload.items[0].icms_valor, "2.29");
const delivery = buildFiscal(
  { ...issuer, deliveryApproved: true },
  [{ ...sale, fulfillment: "delivery" }],
  [item],
  receipts,
  { p: tax },
);
assert.ok(delivery.blockers.some((b) => b.includes("endereço")));
const digital = buildFiscal(
  { ...issuer, qrPresentialApproved: true },
  [{ ...sale, source: "public_menu" }],
  [item],
  receipts,
  { p: tax },
);
assert.deepEqual(digital.blockers, []);
assert.throws(() =>
  optionsSchema.parse({
    ...emptyOptions,
    recipient: { ...emptyOptions.recipient, document: "invalid" },
  }),
);
let network = 0;
const transport = async () => {
  network++;
  return Response.json({
    status: "autorizado",
    chave_nfe: "1".repeat(44),
    numero: "12",
    serie: "1",
    numero_protocolo: "123456789012345",
  });
};
const op = {
  restaurant_id: "qa",
  environment: "production",
  kind: "fiscal",
  provider: "focus",
  reference: "gf_" + "1".repeat(32),
  payload: { ...result.payload, data_emissao: new Date().toISOString() },
};
const cfg = {
  restaurantId: "qa",
  issuerCnpj: issuer.cnpj,
  token: "synthetic",
  enabled: true,
  taxProfileValidated: true,
  environment: "production",
  productionApproved: true,
};
delete process.env.FOCUS_NFE_PRODUCTION_ENABLED;
await assert.rejects(
  () => focusProvider(cfg, transport).submit(op),
  /Produção/,
);
assert.equal(network, 0);
process.env.FOCUS_NFE_PRODUCTION_ENABLED = "true";
const response = await focusProvider(cfg, transport).submit(op);
assert.equal(network, 1);
assert.equal(response.fiscal.protocol, "123456789012345");
await assert.rejects(
  () =>
    focusProvider({ ...cfg, productionApproved: false }, transport).submit(op),
  /Produção/,
);
await assert.rejects(
  () => focusProvider(cfg, transport).submit({ ...op, restaurant_id: "other" }),
  /Contexto/,
);
process.env.FOCUS_NFE_CONNECTIONS = JSON.stringify({
  qa: {
    production: {
      token: "synthetic",
      cnpj: issuer.cnpj,
      productionApproved: false,
    },
  },
});
assert.equal(focusAvailability("qa", "production").enabled, false);
delete process.env.FOCUS_NFE_PRODUCTION_ENABLED;
delete process.env.FOCUS_NFE_CONNECTIONS;
const nfe = buildFiscal(
  {
    ...issuer,
    channels: [
      { source: "waiter", fulfillment: "dine_in", model: "55", presence: "1" },
    ],
  },
  [sale],
  [item],
  receipts,
  { p: tax },
  {
    ...emptyOptions,
    recipient: {
      ...emptyOptions.recipient,
      name: "Empresa QA",
      document: "12345678000123",
      street: "Rua QA",
      number: "1",
      district: "Centro",
      city: "Belo Horizonte",
      cityCode: "3106200",
      uf: "MG",
      zip: "30100000",
      icmsIndicator: "1",
      ie: "123",
    },
  },
);
assert.deepEqual(nfe.blockers, []);
assert.equal(nfe.payload._fiscal_model, "55");
assert.equal(nfe.payload.inscricao_estadual_destinatario, "123");
let target = "";
const nfeProvider = focusProvider(
  { ...cfg, environment: "homologation" },
  async (url, init) => {
    target = url;
    assert.equal(JSON.parse(init.body)._fiscal_model, undefined);
    return Response.json({ status: "processando_autorizacao" });
  },
);
assert.equal(
  (
    await nfeProvider.submit({
      ...op,
      environment: "homologation",
      payload: nfe.payload,
    })
  ).status,
  "pending",
);
assert.ok(target.includes("/v2/nfe?"));
assert.deepEqual(
  buildFiscal(issuer, [sale], [item], receipts, {
    p: { ...tax, icms: "500", retainedStDispensed: true },
  }).blockers,
  [],
);
assert.ok(
  buildFiscal(issuer, [sale], [item], receipts, {
    p: { ...tax, icms: "500", retainedStDispensed: false },
  }).blockers.length,
);
console.log(
  "PASS: additions/service/discount/mixed receipts/change, 200 exact allocations, regular tax calculation, recipient/channel blocks, production and tenant gates; all transports synthetic.",
);
