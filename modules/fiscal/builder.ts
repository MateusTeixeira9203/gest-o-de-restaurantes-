import { issuerSchema, taxSchema, optionsSchema } from "./schema.ts";
import type { Issuer, Tax, FiscalOptions } from "./schema.ts";
import type { Json } from "../integrations/contracts.ts";
import { allocate, decimal, percent } from "./money.ts";
export type Sale = {
  id: string;
  order_number: string;
  source: string;
  fulfillment: string;
  status: string;
  checkout_group_id?: string | null;
  table_id?: string | null;
  subtotal_cents: number;
  service_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
};
export type SaleItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price_cents: number;
  addons: Array<{
    name?: string;
    priceCents?: number;
    price_cents?: number;
    price?: number;
  }>;
};
export type Receipt = {
  order_id: string;
  method: string;
  amount_cents: number;
  received_cents?: number | null;
  change_cents?: number;
};
export function buildFiscal(
  input: Issuer,
  sales: Sale[],
  items: SaleItem[],
  receipts: Receipt[],
  taxes: Record<string, Tax>,
  inputOptions?: FiscalOptions,
) {
  const issuer = issuerSchema.parse(input),
    options = optionsSchema.parse(inputOptions || {}),
    blockers: string[] = [];
  if (!issuer.cnpj || !issuer.legalName || !issuer.ie || !issuer.regime)
    blockers.push(
      "Complete CNPJ, razão social, inscrição estadual e regime do emitente.",
    );
  if (!issuer.reviewed || !issuer.accountant)
    blockers.push("O contador precisa validar o emitente e a tributação.");
  if (
    sales.length > 1 &&
    (!sales[0].checkout_group_id ||
      sales.some(
        (s) =>
          s.checkout_group_id !== sales[0].checkout_group_id ||
          s.table_id !== sales[0].table_id,
      ))
  )
    blockers.push(
      "Selecione pedidos do mesmo fechamento de conta. Pedidos antigos sem vínculo devem ser preparados individualmente.",
    );
  if (new Set(sales.map((s) => s.fulfillment)).size > 1)
    blockers.push("Não misture canais de atendimento no mesmo documento.");
  const rules = sales.map((s) =>
    issuer.channels.find(
      (r) => r.source === s.source && r.fulfillment === s.fulfillment,
    ),
  );
  const model = rules[0]?.model || "65";
  const presence =
    rules[0]?.presence || (sales[0]?.fulfillment === "delivery" ? "4" : "1");
  if (
    rules.some(
      (r, i) =>
        (r?.model || "65") !== model ||
        (r?.presence || (sales[i].fulfillment === "delivery" ? "4" : "1")) !==
          presence,
    )
  )
    blockers.push("Não misture canais com modelos ou presenças diferentes.");
  if (model === "55" && presence === "4")
    blockers.push("Presença 4 é específica da NFC-e com entrega.");
  if (
    model === "65" &&
    presence === "4" &&
    sales.some((s) => s.fulfillment !== "delivery")
  )
    blockers.push("Presença de entrega incompatível com atendimento.");
  const output: Record<string, Json>[] = [];
  const totalCents = sales.reduce((n, s) => n + s.total_cents, 0);
  for (const sale of sales) {
    if (!["completed", "delivered"].includes(sale.status))
      blockers.push(
        `Pedido ${sale.order_number}: conclua o atendimento antes de preparar neste painel.`,
      );
    const presencial = sale.fulfillment === "dine_in";
    const explicitRule = issuer.channels.find(
      (r) => r.source === sale.source && r.fulfillment === sale.fulfillment,
    );
    if (
      !explicitRule &&
      (presencial
        ? !issuer.presentialApproved ||
          (!["waiter", "cashier"].includes(sale.source) &&
            !issuer.qrPresentialApproved)
        : sale.fulfillment === "pickup"
          ? !issuer.pickupApproved
          : sale.fulfillment === "delivery"
            ? !issuer.deliveryApproved
            : true)
    )
      blockers.push(
        `Pedido ${sale.order_number}: canal precisa de enquadramento NFC-e validado pelo contador.`,
      );
    if (
      !explicitRule &&
      sale.fulfillment === "pickup" &&
      !["waiter", "cashier"].includes(sale.source)
    )
      blockers.push(
        "Configure modelo e presença para a retirada solicitada por canal digital.",
      );
    if (sale.service_cents && issuer.servicePolicy !== "other_expense")
      blockers.push(
        `Pedido ${sale.order_number}: valide o tratamento da taxa de serviço.`,
      );
    if (sale.delivery_fee_cents && !issuer.freightApproved)
      blockers.push(
        `Pedido ${sale.order_number}: valide o tratamento do frete.`,
      );
    const lines = items.filter((i) => i.order_id === sale.id);
    const prices = lines.map(
      (item) =>
        item.unit_price_cents +
        (item.addons || []).reduce(
          (n, a) => n + Number(a.priceCents ?? a.price_cents ?? 0),
          0,
        ),
    );
    const weights = lines.map((item, i) => item.quantity * prices[i]);
    const sum = weights.reduce((n, v) => n + v, 0);
    if (
      !lines.length ||
      weights.some((v) => !Number.isSafeInteger(v) || v < 0) ||
      sum !== sale.subtotal_cents
    ) {
      blockers.push(`Pedido ${sale.order_number}: itens divergem do subtotal.`);
      continue;
    }
    const discount =
      sum + sale.service_cents + sale.delivery_fee_cents - sale.total_cents;
    if (discount < 0 || discount > sum) {
      blockers.push(
        `Pedido ${sale.order_number}: total inclui ajustes não mapeados no fiscal.`,
      );
      continue;
    }
    if (discount && !issuer.discountsApproved)
      blockers.push(
        `Pedido ${sale.order_number}: valide o tratamento do desconto.`,
      );
    const discounts = allocate(discount, weights),
      services = allocate(sale.service_cents, weights),
      freights = allocate(sale.delivery_fee_cents, weights);
    for (const [i, item] of lines.entries()) {
      const raw = item.product_id ? taxes[item.product_id] : undefined;
      const parsed = taxSchema.safeParse(raw);
      const tax = parsed.success ? parsed.data : undefined;
      if (
        !tax?.reviewed ||
        !tax.ncm ||
        !tax.cfop ||
        !tax.origin ||
        !tax.icms ||
        !tax.pis ||
        !tax.cofins
      )
        blockers.push(
          `${item.product_name}: classificação fiscal incompleta ou não revisada.`,
        );
      if (item.addons.length && tax?.addonsPolicy !== "include")
        blockers.push(
          `${item.product_name}: adicionais precisam de classificação fiscal própria ou validação como composição do produto.`,
        );
      if (tax && !tax.cfop.startsWith("5"))
        blockers.push(
          `${item.product_name}: operação fora da matriz interna de NFC-e.`,
        );
      const base = weights[i] - discounts[i] + services[i] + freights[i];
      const row: Record<string, Json> = {
        numero_item: output.length + 1,
        codigo_produto: item.product_id || item.id,
        descricao:
          `${item.product_name} ${item.variant_name}${item.addons.length ? " + " + item.addons.map((a) => a.name).join(", ") : ""}`.slice(
            0,
            120,
          ),
        codigo_ncm: tax?.ncm || "",
        cfop: tax?.cfop || "",
        unidade_comercial: tax?.unit || "UN",
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: decimal(prices[i]),
        valor_bruto: decimal(weights[i]),
        unidade_tributavel: tax?.unit || "UN",
        quantidade_tributavel: item.quantity,
        valor_unitario_tributavel: decimal(prices[i]),
        icms_origem: tax?.origin || "",
        icms_situacao_tributaria: tax?.icms || "",
        pis_situacao_tributaria: tax?.pis || "",
        cofins_situacao_tributaria: tax?.cofins || "",
        inclui_no_total: "1",
        valor_desconto: decimal(discounts[i]),
        valor_outras_despesas: decimal(services[i]),
        valor_frete: decimal(freights[i]),
        ...(tax?.cest ? { cest: tax.cest } : {}),
        ...(tax?.gtin
          ? {
              codigo_barras_comercial: tax.gtin,
              codigo_barras_tributavel: tax.gtin,
            }
          : {}),
        ...(tax?.benefitCode
          ? { codigo_beneficio_fiscal: tax.benefitCode }
          : {}),
      };
      let legacyTax = 0;
      if (tax) {
        const simple = ["1", "4"].includes(issuer.regime);
        if (
          simple
            ? !["102", "103", "300", "400", "500"].includes(tax.icms)
            : !["00", "20", "40", "41", "60"].includes(tax.icms)
        )
          blockers.push(
            `${item.product_name}: CSOSN/CST exige regra tributária ainda não coberta.`,
          );
        if (
          ["500", "60"].includes(tax.icms) &&
          (model !== "65" || !tax.retainedStDispensed)
        )
          blockers.push(
            `${item.product_name}: retenção ST exige valores de origem ou dispensa validada para NFC-e.`,
          );
        if (["00", "20"].includes(tax.icms) && !simple) {
          if (
            tax.icmsRate === "" ||
            (tax.icms === "20" && tax.icmsReduction === "")
          )
            blockers.push(
              `${item.product_name}: informe alíquota/redução de ICMS.`,
            );
          const taxable =
            base - percent(base, tax.icms === "20" ? tax.icmsReduction : "0");
          const value = percent(taxable, tax.icmsRate);
          legacyTax += value;
          Object.assign(row, {
            icms_modalidade_base_calculo: "3",
            icms_base_calculo: decimal(taxable),
            icms_aliquota: tax.icmsRate,
            icms_valor: decimal(value),
            ...(tax.icms === "20"
              ? { icms_reducao_base_calculo: tax.icmsReduction }
              : {}),
          });
        }
        const contributionsBase =
          base - (tax.pisCofinsExcludeIcms ? legacyTax : 0);
        for (const name of ["pis", "cofins"] as const) {
          if (["01", "02"].includes(tax[name])) {
            const rate = tax[name === "pis" ? "pisRate" : "cofinsRate"];
            if (rate === "")
              blockers.push(
                `${item.product_name}: informe alíquota de ${name.toUpperCase()}.`,
              );
            const value = percent(contributionsBase, rate);
            legacyTax += value;
            Object.assign(row, {
              [name + "_base_calculo"]: decimal(contributionsBase),
              [name + "_aliquota_porcentual"]: rate,
              [name + "_valor"]: decimal(value),
            });
          } else if (!["04", "06", "07", "08", "09"].includes(tax[name]))
            blockers.push(
              `${item.product_name}: ${name.toUpperCase()} exige regra ainda não coberta.`,
            );
        }
        if (tax.rtc?.enabled) {
          const rtc = tax.rtc;
          if (
            [rtc.ufRate, rtc.municipalRate, rtc.cbsRate].some((r) => r === "")
          )
            blockers.push(`${item.product_name}: complete alíquotas IBS/CBS.`);
          const rtcBase = base - (rtc.excludeLegacyTaxes ? legacyTax : 0);
          if (rtcBase < 0)
            blockers.push(`${item.product_name}: base IBS/CBS inválida.`);
          const validBase = Math.max(0, rtcBase),
            uf = percent(validBase, rtc.ufRate),
            municipal = percent(validBase, rtc.municipalRate),
            cbs = percent(validBase, rtc.cbsRate);
          Object.assign(row, {
            ibs_cbs_situacao_tributaria: rtc.cst,
            ibs_cbs_classificacao_tributaria: rtc.classification,
            ibs_cbs_base_calculo: decimal(validBase),
            ibs_uf_aliquota: rtc.ufRate,
            ibs_uf_valor: decimal(uf),
            ibs_mun_aliquota: rtc.municipalRate,
            ibs_mun_valor: decimal(municipal),
            ibs_valor_total: decimal(uf + municipal),
            cbs_aliquota: rtc.cbsRate,
            cbs_valor: decimal(cbs),
            valor_total_item: decimal(base),
          });
        }
      }
      output.push(row);
    }
    if (
      receipts
        .filter((p) => p.order_id === sale.id)
        .reduce((n, p) => n + Number(p.amount_cents), 0) !== sale.total_cents
    )
      blockers.push(
        `Pedido ${sale.order_number}: recebimentos não conferem com o total.`,
      );
  }
  const methods: Record<string, string> = {
    cash: "01",
    credit: "03",
    debit: "04",
    pix: "17",
  };
  let change = 0;
  for (const p of receipts) {
    const c = Number(p.change_cents || 0),
      received = Number(p.received_cents ?? p.amount_cents);
    change += c;
    if (
      !methods[p.method] ||
      !Number.isSafeInteger(received) ||
      received - Number(p.amount_cents) !== c ||
      (c && p.method !== "cash")
    )
      blockers.push("Há pagamento/troco sem mapeamento fiscal consistente.");
  }
  if (totalCents <= 0 || (model === "65" && totalCents > 20000000))
    blockers.push(
      "Total fora da faixa coberta para NFC-e; consulte o contador.",
    );
  const r = options.recipient,
    delivery = sales.some((s) => s.fulfillment === "delivery");
  if ((model === "55" || delivery || totalCents >= 1000000) && !r.document)
    blockers.push("Informe a identificação do destinatário.");
  if (r.document && !r.name) blockers.push("Informe o nome do destinatário.");
  if (model === "65" && r.icmsIndicator !== "9")
    blockers.push(
      "Destinatário contribuinte exige enquadramento NF-e modelo 55.",
    );
  if (r.icmsIndicator === "1" && !r.ie)
    blockers.push("Informe a inscrição estadual do destinatário contribuinte.");
  if (
    (delivery || model === "55") &&
    (!r.street ||
      !r.number ||
      !r.district ||
      !r.city ||
      !r.cityCode ||
      r.uf !== "MG" ||
      !r.zip)
  )
    blockers.push("Complete o endereço do destinatário em Minas Gerais.");
  const payload: Record<string, Json> = {
    _fiscal_model: model,
    cnpj_emitente: issuer.cnpj,
    natureza_operacao: "VENDA AO CONSUMIDOR",
    tipo_documento: "1",
    finalidade_emissao: "1",
    consumidor_final: "1",
    local_destino: "1",
    presenca_comprador: presence,
    indicador_intermediario: "0",
    indicador_inscricao_estadual_destinatario: r.icmsIndicator,
    modalidade_frete: delivery ? "0" : "9",
    items: output,
    valor_troco: decimal(change),
    formas_pagamento: receipts.map((p) => ({
      forma_pagamento: methods[p.method] || "99",
      valor_pagamento: decimal(Number(p.received_cents ?? p.amount_cents)),
      ...(["credit", "debit"].includes(p.method)
        ? { tipo_integracao: "2" }
        : {}),
    })),
    ...(r.document
      ? {
          [r.document.length === 11 ? "cpf_destinatario" : "cnpj_destinatario"]:
            r.document,
          nome_destinatario: r.name,
        }
      : {}),
    ...(r.ie ? { inscricao_estadual_destinatario: r.ie } : {}),
    ...(delivery || model === "55"
      ? {
          logradouro_destinatario: r.street,
          numero_destinatario: r.number,
          bairro_destinatario: r.district,
          municipio_destinatario: r.city,
          codigo_municipio_destinatario: r.cityCode,
          uf_destinatario: r.uf,
          cep_destinatario: r.zip,
        }
      : {}),
    ...(options.notes
      ? { informacoes_adicionais_contribuinte: options.notes }
      : {}),
  };
  return {
    payload,
    totalCents,
    blockers: [...new Set(blockers)],
    sales,
    items,
    receipts,
    issuer,
    taxes,
    options,
  };
}
