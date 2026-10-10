"use client";
import { useState } from "react";
import Link from "next/link";
import { emptyIssuer, emptyTax, emptyOptions, taxSchema } from "@/modules/fiscal/schema";
import type { Issuer, Tax, FiscalOptions } from "@/modules/fiscal/schema";
export type FiscalDocument = {
  id: string;
  environment: "homologation" | "production";
  options: FiscalOptions;
  model?: "55" | "65";
  created_at: string;
  total_cents: number;
  status: string;
  cancellation_status?: string;
  cancellation_reason?: string;
  cancellation_result?: { message?: string; code?: string };
  blockers: string[];
  reference?: string;
  operation_id?: string;
  result?: {
    code: string;
    message?: string;
    externalId?: string;
    fiscal?: { number?: string; series?: string; protocol?: string };
  };
  sales: Array<{ order_number: string }>;
  files: Array<{ id: string; kind: string }>;
};
export type Overview = {
  environment: "homologation" | "production";
  issuer: Issuer;
  products: Array<{ id: string; name: string; data: Tax | null }>;
  sales: Array<{
    id: string;
    order_number: string;
    total_cents: number;
    label?: string;
  }>;
  documents: FiscalDocument[];
  enabled: boolean;
};
const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
const labels: Record<string, string> = {
  draft: "Preparação",
  prepared: "Na fila",
  dispatching: "Consultando / enviando",
  unknown: "Resultado incerto: consultar",
  pending: "Em processamento",
  succeeded: "Autorizada",
  failed: "Rejeitada",
  cancelled: "Cancelada",
};
export function FiscalDocumentCard({ d, environment, enabled, run, busy }: { d: FiscalDocument; environment: "homologation" | "production"; enabled: boolean; run: (command: unknown) => Promise<boolean>; busy: boolean }) {
return (
                <article key={d.id} className="command-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        Pedidos{" "}
                        {d.sales.map((s) => "#" + s.order_number).join(", ")}
                      </h3>
                      <p>
                        {d.model === "55" ? "NF-e 55" : "NFC-e 65"} ·{" "}
                        {money(d.total_cents)} ·{" "}
                        {new Date(d.created_at).toLocaleString("pt-BR")}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {labels[d.status] || d.status}
                      </p>
                    </div>
                    <span className="text-xs text-neutral-500">
                      {environment === "homologation"
                        ? "Homologação"
                        : "Produção"}
                    </span>
                  </div>
                  {!!d.blockers.length && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3">
                      <strong>Pendências para emissão</strong>
                      <ul className="ml-5 list-disc text-sm">
                        {d.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {d.cancellation_result && (
                    <p className="mt-2 text-sm">
                      Cancelamento:{" "}
                      {d.cancellation_result.message ||
                        d.cancellation_result.code}
                    </p>
                  )}
                  {d.result && (
                    <p className="mt-2 text-sm">
                      Retorno: {d.result.message || d.result.code}
                    </p>
                  )}
                  {d.result?.externalId && (
                    <p className="mt-2 break-all text-sm">
                      Chave: {d.result.externalId} · Número{" "}
                      {d.result.fiscal?.number || "pendente"} / série{" "}
                      {d.result.fiscal?.series || "pendente"} · Protocolo{" "}
                      {d.result.fiscal?.protocol || "pendente"}
                    </p>
                  )}
                  {d.reference && (
                    <p className="mt-2 break-all text-xs text-neutral-500">
                      Referência: {d.reference}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(!d.operation_id || d.status === "failed") && (
                      <ReviseDocument document={d} run={run} busy={busy} />
                    )}
                    {!["succeeded", "failed", "cancelled"].includes(
                      d.status,
                    ) && (
                      <button
                        className="primary-button"
                        disabled={busy || !enabled || !!d.blockers.length}
                        onClick={() =>
                          void run({ action: "process", documentId: d.id })
                        }
                      >
                        {d.operation_id
                          ? "Consultar resultado"
                          : environment === "homologation"
                            ? "Enviar à homologação"
                            : "Emitir nota em produção"}
                      </button>
                    )}
                    {["succeeded", "cancelled"].includes(d.status) && (
                      <button
                        className="secondary-button"
                        disabled={busy || !enabled}
                        onClick={() =>
                          void run({ action: "files", documentId: d.id })
                        }
                      >
                        Buscar arquivos
                      </button>
                    )}
                    {d.status === "succeeded" && (
                      <CancelFiscal
                        id={d.id}
                        run={run}
                        disabled={busy || !enabled}
                        status={d.cancellation_status}
                        initialReason={d.cancellation_reason}
                      />
                    )}
                    {d.files
                      .filter((f) => f.kind === "auxiliary")
                      .map((f) => (
                        <a
                          key={"preview-" + f.id}
                          className="secondary-button"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`/api/operations/fiscal/files/${f.id}?preview=1`}
                        >
                          Abrir / imprimir DANFE
                        </a>
                      ))}
                    {d.files.map((f) => (
                      <a
                        key={f.id}
                        className="secondary-button"
                        href={`/api/operations/fiscal/files/${f.id}`}
                      >
                        Baixar{" "}
                        {f.kind === "auxiliary"
                          ? "documento auxiliar"
                          : f.kind === "cancellation"
                            ? "evento de cancelamento"
                            : "XML"}
                      </a>
                    ))}
                  </div>
                </article>
);
}
export function Settings({
  data,
  run,
  busy,
  section = "company",
}: {
  data: Overview;
  section?: "company" | "tax";
  run: (command: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [issuer, setIssuer] = useState({ ...emptyIssuer, ...data.issuer }),
    [productId, setProductId] = useState(data.products[0]?.id || ""),
    [tax, setTax] = useState<Tax>(
      taxSchema.parse(data.products[0]?.data || emptyTax),
    );
  const field = (key: keyof Issuer, label: string, max = 150) => (
    <label className="admin-field">
      <span>{label}</span>
      <input
        maxLength={max}
        value={String(issuer[key])}
        onChange={(e) => setIssuer((v) => ({ ...v, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <div className="space-y-5">
      <section hidden={section !== "company"} className="settings-card">
        <h3>Dados de quem emite a nota</h3><p>Esta é a empresa do restaurante. Preencha uma vez; os dados serão usados nas próximas emissões.</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "issuer", data: issuer });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {field("cnpj", "CNPJ (somente números)", 14)}
            {field("legalName", "Razão social")}
            {field("ie", "Inscrição estadual")}
            <label className="admin-field">
              <span>Regime tributário</span>
              <select
                value={issuer.regime}
                onChange={(e) =>
                  setIssuer((v) => ({
                    ...v,
                    regime: e.target.value as Issuer["regime"],
                  }))
                }
              >
                <option value="">Não informado</option>
                <option value="1">Simples Nacional</option>
                <option value="2">Simples com excesso de sublimite</option>
                <option value="3">Regime normal</option>
                <option value="4">MEI</option>
              </select>
            </label>
            {field("accountant", "Contador responsável")}
          </div>
          <details className="workspace-details rounded-xl border p-4">
            <summary>Validações do contador e tipos de venda</summary>
            <div className="space-y-4">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={issuer.reviewed}
                  onChange={(e) =>
                    setIssuer((v) => ({ ...v, reviewed: e.target.checked }))
                  }
                />
                Cadastro conferido com o contador
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={issuer.presentialApproved}
                  onChange={(e) =>
                    setIssuer((v) => ({
                      ...v,
                      presentialApproved: e.target.checked,
                    }))
                  }
                />
                Contador validou NFC-e para as operações presenciais cobertas
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    [
                      "qrPresentialApproved",
                      "Pedido digital feito presencialmente validado",
                    ],
                    [
                      "pickupApproved",
                      "Retirada presencial validada para NFC-e",
                    ],
                    ["deliveryApproved", "Entrega em MG validada para NFC-e"],
                    ["freightApproved", "Frete rateado entre itens validado"],
                    [
                      "discountsApproved",
                      "Desconto rateado entre itens validado",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={issuer[key]}
                      onChange={(e) =>
                        setIssuer((v) => ({ ...v, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="admin-field">
                <span>Taxa de serviço</span>
                <select
                  value={issuer.servicePolicy}
                  onChange={(e) =>
                    setIssuer((v) => ({
                      ...v,
                      servicePolicy: e.target.value as Issuer["servicePolicy"],
                    }))
                  }
                >
                  <option value="blocked">Pendente de validação</option>
                  <option value="other_expense">
                    Contador validou outras despesas incluídas nas bases,
                    rateadas entre itens
                  </option>
                </select>
              </label>
              <label className="admin-field">
                <span>Procedimento validado para indisponibilidade</span>
                <textarea
                  maxLength={1500}
                  value={issuer.contingencyInstructions}
                  onChange={(e) =>
                    setIssuer((v) => ({
                      ...v,
                      contingencyInstructions: e.target.value,
                    }))
                  }
                />
              </label>
              <ChannelRules
                value={issuer.channels}
                onChange={(channels) => setIssuer((v) => ({ ...v, channels }))}
              />
              <p className="text-sm">
                Este procedimento não ativa emissão offline. A aplicação depende
                de conexão.
              </p>
            </div>
          </details>
          <button disabled={busy} className="primary-button">
            Salvar dados da empresa
          </button>
          <p className="text-sm text-neutral-500">
            Certificado, CSC e credenciais são configurados por canal seguro no
            provedor/servidor. Não informe segredos nestes campos.
          </p>
        </form>
      </section>
      <section hidden={section !== "tax"} className="settings-card">
        <h3>Impostos dos produtos</h3><p>Configuração técnica de implantação, com orientação do contador.</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "product", productId, data: tax });
          }}
        >
          <p className="text-sm text-neutral-500">
            Preencha conforme o contador. Nenhuma classificação é sugerida pelo
            nome do prato.
          </p>
          <label className="admin-field">
            <span>Produto</span>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setTax(
                  taxSchema.parse(
                    data.products.find((p) => p.id === e.target.value)?.data ||
                      emptyTax,
                  ),
                );
              }}
            >
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["ncm", "NCM"],
                ["cfop", "CFOP"],
                ["origin", "Origem"],
                ["icms", "CSOSN / CST ICMS"],
                ["pis", "CST PIS"],
                ["cofins", "CST COFINS"],
                ["cest", "CEST (se aplicável)"],
                ["unit", "Unidade"],
                ["gtin", "GTIN ou SEM GTIN"],
                ["benefitCode", "Código de benefício"],
                ["icmsRate", "ICMS (%)"],
                ["icmsReduction", "Redução base ICMS (%)"],
                ["pisRate", "PIS (%)"],
                ["cofinsRate", "Cofins (%)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="admin-field">
                <span>{label}</span>
                <input
                  value={tax[key]}
                  inputMode="numeric"
                  onChange={(e) =>
                    setTax((v) => ({ ...v, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <label className="admin-field">
            <span>Adicionais / composição</span>
            <select
              value={tax.addonsPolicy}
              onChange={(e) =>
                setTax((v) => ({
                  ...v,
                  addonsPolicy: e.target.value as Tax["addonsPolicy"],
                }))
              }
            >
              <option value="blocked">Pendente de enquadramento</option>
              <option value="include">
                Contador validou adicionais como composição com a mesma
                tributação
              </option>
            </select>
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={tax.retainedStDispensed}
              onChange={(e) =>
                setTax((v) => ({ ...v, retainedStDispensed: e.target.checked }))
              }
            />
            Contador validou dispensa dos valores de ST retidos para esta NFC-e
            (CSOSN 500/CST 60)
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={tax.pisCofinsExcludeIcms}
              onChange={(e) =>
                setTax((v) => ({
                  ...v,
                  pisCofinsExcludeIcms: e.target.checked,
                }))
              }
            />
            Excluir ICMS calculado da base PIS/Cofins conforme contador
          </label>
          <details className="rounded-lg border p-3">
            <summary>IBS/CBS — tributação regular CST 000</summary>
            <p className="my-2 text-sm">
              Configure apenas quando validado pelo contador. Regimes
              específicos e redução de alíquotas precisam de outro
              enquadramento.
            </p>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={tax.rtc?.enabled || false}
                onChange={(e) =>
                  setTax((v) => ({
                    ...v,
                    rtc: e.target.checked
                      ? {
                          cst: "000",
                          classification: "",
                          ufRate: "",
                          municipalRate: "",
                          cbsRate: "",
                          excludeLegacyTaxes: false,
                          ...v.rtc,
                          enabled: true,
                        }
                      : undefined,
                  }))
                }
              />
              Informar IBS/CBS
            </label>
            {tax.rtc?.enabled && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["classification", "Classificação tributária"],
                      ["ufRate", "IBS estadual (%)"],
                      ["municipalRate", "IBS municipal (%)"],
                      ["cbsRate", "CBS (%)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="admin-field">
                      <span>{label}</span>
                      <input
                        value={tax.rtc?.[key] || ""}
                        onChange={(e) =>
                          setTax((v) => ({
                            ...v,
                            rtc: { ...v.rtc!, [key]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={tax.rtc.excludeLegacyTaxes}
                    onChange={(e) =>
                      setTax((v) => ({
                        ...v,
                        rtc: {
                          ...v.rtc!,
                          excludeLegacyTaxes: e.target.checked,
                        },
                      }))
                    }
                  />
                  Excluir ICMS, PIS e Cofins calculados da base IBS/CBS,
                  conforme contador
                </label>
              </>
            )}
          </details>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={tax.reviewed}
              onChange={(e) =>
                setTax((v) => ({ ...v, reviewed: e.target.checked }))
              }
            />
            Classificação conferida com o contador
          </label>
          <button className="primary-button" disabled={busy || !productId}>
            Salvar classificação
          </button>
        </form>
      </section>
    </div>
  );
}
export function ExportPanel({
  environment,
}: {
  environment: "homologation" | "production";
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today);
  return (
    <div className="command-card space-y-4 p-5">
      <h3 className="text-lg font-semibold">
        Pacote para conferência do contador
      </h3>
      <p>
        Contém arquivos disponíveis, índice e pendências. Documentos de
        homologação não têm validade fiscal. O índice também relaciona vendas do
        período ainda sem preparação.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="admin-field">
          <span>De</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Até</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <a
        className="primary-button"
        download={`fiscal-${environment}.zip`}
        href={`/api/operations/fiscal/export?environment=${environment}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
      >
        Baixar pacote{" "}
        {environment === "homologation" ? "de homologação" : "de produção"}
      </a>
      <p className="text-sm text-neutral-500">
        Filtro por emissão e eventos no período; preparações pendentes pela data
        de criação. Inclui índice CSV e JSON. Para relatórios financeiros, use a
        exportação do Financeiro.
      </p>
      <Link className="text-button" href="/gestao/financeiro">
        Abrir financeiro
      </Link>
    </div>
  );
}

function CancelFiscal({
  id,
  run,
  disabled,
  status,
  initialReason,
}: {
  id: string;
  run: (c: unknown) => Promise<boolean>;
  disabled: boolean;
  status?: string;
  initialReason?: string;
}) {
  const [reason, setReason] = useState(initialReason || "");
  return (
    <details className="w-full rounded-lg border p-3">
      <summary>Cancelamento fiscal</summary>
      <p className="my-2 text-sm">
        Solicita cancelamento na Focus. Não estorna pagamento nem devolve
        estoque. A autorização depende das regras e prazos fiscais.
      </p>
      {status && <p>Status da solicitação: {labels[status] || status}</p>}
      <label className="admin-field">
        <span>Justificativa (15 a 255 caracteres)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={15}
          maxLength={255}
        />
      </label>
      <button
        className="secondary-button mt-2"
        disabled={disabled || reason.trim().length < 15}
        onClick={() => void run({ action: "cancel", documentId: id, reason })}
      >
        Solicitar / consultar cancelamento
      </button>
    </details>
  );
}

export function RecipientFields({value,onChange}:{value:FiscalOptions;onChange:(v:FiscalOptions)=>void}) {
  const field=(key: keyof FiscalOptions["recipient"],label:string)=><label key={key} className="admin-field"><span>{label}</span><input value={value.recipient[key]} onChange={e=>onChange({...value,recipient:{...value.recipient,[key]:e.target.value}})}/></label>;
  return <details className="my-3 rounded-lg border p-3">
    <summary>Incluir CPF/CNPJ do consumidor</summary>
    <p className="my-2 text-sm">Na venda presencial comum, estes campos podem ficar em branco. Preencha quando o cliente solicitar ou quando a operação exigir. São os dados do cliente, não os do restaurante.</p>
    <div className="grid gap-3 sm:grid-cols-2">{field("name","Nome do consumidor")}{field("document","CPF/CNPJ (números)")}</div>
    <details className="mt-4"><summary>Endereço e informações adicionais</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{([["street","Logradouro"],["number","Número"],["district","Bairro"],["city","Município"],["cityCode","Código IBGE"],["uf","UF"],["zip","CEP"],["ie","Inscrição estadual (se aplicável)"]] as const).map(([key,label])=>field(key,label))}</div>
      <label className="admin-field mt-3">
        <span>Condição do destinatário perante o ICMS</span>
        <select
          value={value.recipient.icmsIndicator}
          onChange={(e) =>
            onChange({
              ...value,
              recipient: {
                ...value.recipient,
                icmsIndicator: e.target
                  .value as FiscalOptions["recipient"]["icmsIndicator"],
              },
            })
          }
        >
          <option value="9">Não contribuinte</option>
          <option value="1">Contribuinte (exige NF-e e IE)</option>
          <option value="2">Contribuinte isento (exige NF-e)</option>
        </select>
      </label>
      <label className="admin-field mt-3">
        <span>Informações complementares validadas</span>
        <textarea
          maxLength={2000}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      </details>
    </details>
  ;
}
function ReviseDocument({
  document,
  run,
  busy,
}: {
  document: FiscalDocument;
  run: (c: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [options, setOptions] = useState(
    document.options?.recipient ? document.options : emptyOptions,
  );
  return (
    <details className="w-full rounded-lg border p-3">
      <summary>Revalidar / corrigir preparação</summary>
      <RecipientFields value={options} onChange={setOptions} />
      <button
        className="secondary-button"
        disabled={busy || document.result?.code === "focus_denied"}
        onClick={() =>
          void run({ action: "refresh", documentId: document.id, options })
        }
      >
        Revalidar preparação
      </button>
    </details>
  );
}

function ChannelRules({
  value,
  onChange,
}: {
  value: Issuer["channels"];
  onChange: (rows: Issuer["channels"]) => void;
}) {
  const [source, setSource] = useState<"waiter" | "cashier" | "public_menu">(
      "waiter",
    ),
    [fulfillment, setFulfillment] = useState<"dine_in" | "pickup" | "delivery">(
      "dine_in",
    ),
    [model, setModel] = useState<"55" | "65">("65"),
    [presence, setPresence] = useState<"1" | "2" | "3" | "4" | "9">("1");
  return (
    <details className="rounded-lg border p-3">
      <summary>Matriz de canais validada pelo contador</summary>
      <p className="my-2 text-sm">
        Regras explícitas substituem as opções simplificadas acima. Modelo 55
        cobre venda normal interna em MG. Operações interestaduais, devolução e
        regimes especiais precisam de cobertura própria.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="admin-field">
          <span>Origem do pedido</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
          >
            <option value="waiter">Garçom</option>
            <option value="cashier">Caixa</option>
            <option value="public_menu">Cardápio digital</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Atendimento</span>
          <select
            value={fulfillment}
            onChange={(e) =>
              setFulfillment(e.target.value as typeof fulfillment)
            }
          >
            <option value="dine_in">Mesa / comanda</option>
            <option value="pickup">Retirada</option>
            <option value="delivery">Entrega</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Modelo fiscal</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as typeof model)}
          >
            <option value="65">NFC-e 65</option>
            <option value="55">NF-e 55</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Presença do comprador</span>
          <select
            value={presence}
            onChange={(e) => setPresence(e.target.value as typeof presence)}
          >
            <option value="1">Presencial</option>
            <option value="2">Internet</option>
            <option value="3">Teleatendimento</option>
            <option value="4">Entrega NFC-e</option>
            <option value="9">Outros não presenciais</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        className="secondary-button my-3"
        onClick={() =>
          onChange([
            ...value.filter(
              (r) => r.source !== source || r.fulfillment !== fulfillment,
            ),
            { source, fulfillment, model, presence },
          ])
        }
      >
        Adicionar / substituir regra
      </button>
      {value.map((r) => (
        <div
          key={r.source + r.fulfillment}
          className="flex flex-wrap items-center justify-between gap-2 border-t py-2"
        >
          <span>
            {r.source === "waiter"
              ? "Garçom"
              : r.source === "cashier"
                ? "Caixa"
                : "Digital"}{" "}
            ·{" "}
            {r.fulfillment === "dine_in"
              ? "Mesa"
              : r.fulfillment === "pickup"
                ? "Retirada"
                : "Entrega"}{" "}
            · modelo {r.model} · presença {r.presence}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(value.filter((row) => row !== r))}
          >
            Remover regra
          </button>
        </div>
      ))}
      <p className="text-sm text-neutral-500">
        Use Salvar dados da empresa para gravar a matriz.
      </p>
    </details>
  );
}
