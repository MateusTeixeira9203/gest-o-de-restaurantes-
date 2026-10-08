"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { money } from "@/lib/domain";
import type { FinanceCommand } from "@/modules/finance/schema";
import type {
  FinancialSnapshot,
  Shift,
  FinancialDocument,
} from "@/modules/finance/read-model";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const brl = (value: string | number) => money(Number(value) / 100);
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm";
const text = (form: FormData, name: string) =>
  String(form.get(name) || "").trim();
function amount(form: FormData, name: string) {
  const value = text(form, name).replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Informe um valor em reais com até duas casas decimais.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
type Run = (command: FinanceCommand) => Promise<boolean>;
function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        className={`${inputClass} mt-1`}
        {...(type === "number" ? { step: "0.01", min: "0" } : {})}
      />
    </label>
  );
}
function useFinance(from: string, to: string, cashOnly = false) {
  const [data, setData] = useState<FinancialSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch(
        `/api/operations/finance?from=${from}&to=${to}${cashOnly ? "&cash=1" : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as FinancialSnapshot & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Financeiro indisponível.");
      if (current !== generation.current) return;
      setData(body);
      setError("");
    } catch (e) {
      if (current !== generation.current) return;
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, [from, to, cashOnly]);
  // reload updates state only after the external HTTP response, never synchronously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload awaits HTTP before updating state.
    void reload();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 20000);
    return () => clearInterval(id);
  }, [reload]);
  const run: Run = async (command) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    const body = JSON.stringify(command);
    const key = keys.current.get(body) || crypto.randomUUID();
    keys.current.set(body, key);
    try {
      const response = await fetch("/api/operations/finance", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      keys.current.delete(body);
      await reload();
      toast.success("Operação registrada.");
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Conexão interrompida. Tente novamente para confirmar a mesma operação.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { data, error, busy, run, reload };
}
function Form({
  children,
  submit,
  label,
  busy,
}: {
  children: React.ReactNode;
  submit: (form: FormData) => Promise<boolean>;
  label: string;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          if (await submit(new FormData(form))) form.reset();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Confira os dados.",
          );
        }
      }}
      className="space-y-3"
    >
      <fieldset disabled={busy} className="space-y-3">
        {children}
        <button className="primary-button" type="submit">
          {busy ? "Salvando…" : label}
        </button>
      </fieldset>
    </form>
  );
}
function CashControls({
  shifts,
  run,
  busy,
}: {
  shifts: Shift[];
  run: Run;
  busy: boolean;
}) {
  const shift = shifts.find((s) => !s.closed_at);
  return (
    <section className="command-card p-5">
      <h2 className="section-title">Caixa operacional</h2>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
        Dinheiro físico separado de Pix, cartões e saldo bancário.
      </p>
      {!shift ? (
        <Form
          busy={busy}
          label="Abrir caixa"
          submit={(form) =>
            run({ action: "open_shift", openingCents: amount(form, "opening") })
          }
        >
          <Field
            label="Fundo inicial em dinheiro (R$)"
            name="opening"
            type="number"
            value="0.00"
          />
        </Form>
      ) : (
        <>
          <div className="mb-5 rounded-xl bg-emerald-50 p-4">
            <p className="text-sm">
              Aberto por {shift.opened_by} ·{" "}
              {new Date(shift.opened_at).toLocaleString("pt-BR")}
            </p>
            <p className="mt-2 text-sm text-neutral-600">Dinheiro esperado</p>
            <strong className="text-3xl">{brl(shift.expected_cents)}</strong>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Form
              busy={busy}
              label="Registrar movimentação"
              submit={(form) =>
                run({
                  action: "cash_move",
                  kind: text(form, "kind") as "topup" | "withdrawal",
                  amountCents: amount(form, "amount"),
                  description: text(form, "description"),
                })
              }
            >
              <label className="block text-sm">
                Movimentação
                <select name="kind" className={inputClass}>
                  <option value="topup">Suprimento: banco → caixa</option>
                  <option value="withdrawal">Sangria: caixa → banco</option>
                </select>
              </label>
              <Field label="Valor (R$)" name="amount" type="number" />
              <Field label="Motivo / referência" name="description" />
            </Form>
            <Form
              busy={busy}
              label="Conferir e fechar caixa"
              submit={(form) =>
                run({
                  action: "close_shift",
                  shiftId: shift.id,
                  countedCents: amount(form, "counted"),
                  note: text(form, "note"),
                })
              }
            >
              <Field
                label="Dinheiro contado (R$)"
                name="counted"
                type="number"
              />
              <Field
                label="Observação (obrigatória se houver diferença)"
                name="note"
                required={false}
              />
              <p className="text-xs text-neutral-500">
                Conte apenas dinheiro. Pedidos em preparo continuam na operação
                após o fechamento.
              </p>
            </Form>
          </div>
        </>
      )}
      {shifts.some((s) => s.closed_at) && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Últimos fechamentos
          </summary>
          <div className="mt-3 space-y-2">
            {shifts
              .filter((s) => s.closed_at)
              .map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg bg-neutral-50 p-3 text-sm"
                >
                  <strong>
                    {new Date(s.closed_at!).toLocaleString("pt-BR")}
                  </strong>
                  <p>
                    Esperado: {brl(s.expected_cents)} · Contado:{" "}
                    {brl(s.counted_cents!)} · Diferença:{" "}
                    {brl(Number(s.counted_cents) - Number(s.expected_cents))}
                  </p>
                  {s.closing_note && <p>{s.closing_note}</p>}
                </div>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}
export function CashShiftPanel() {
  const { data, error, run, busy, reload } = useFinance(today(), today(), true);
  return (
    <div className="my-5">
      {error && (
        <p role="alert" className="mb-3 text-red-700">
          {error}{" "}
          <button onClick={() => void reload()}>Tentar novamente</button>
        </p>
      )}
      {data ? (
        <CashControls shifts={data.shifts} run={run} busy={busy} />
      ) : (
        <p>Carregando caixa…</p>
      )}
    </div>
  );
}
function DocumentCard({
  doc,
  data,
  run,
  busy,
}: {
  doc: FinancialDocument;
  data: FinancialSnapshot;
  run: Run;
  busy: boolean;
}) {
  const remaining = Number(doc.amount_cents) - Number(doc.paid_cents);
  const overdue =
    remaining > 0 && !doc.cancelled_at && doc.due_date < data.today;
  return (
    <article className="command-card p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <span
            className={`text-xs font-semibold ${overdue ? "text-red-700" : "text-neutral-500"}`}
          >
            {doc.cancelled_at
              ? "Cancelada"
              : remaining === 0
                ? "Quitada"
                : overdue
                  ? "Vencida"
                  : Number(doc.paid_cents) > 0
                    ? "Parcial"
                    : "Em aberto"}{" "}
            · {doc.kind === "payable" ? "A pagar" : "A receber"}
          </span>
          <h3 className="mt-1 font-semibold">{doc.title}</h3>
          <p className="text-sm text-neutral-500">
            {doc.contact} · Vencimento{" "}
            {doc.due_date.split("-").reverse().join("/")}
          </p>
        </div>
        <div className="text-right">
          <strong>{brl(remaining)}</strong>
          <p className="text-xs text-neutral-500">de {brl(doc.amount_cents)}</p>
        </div>
      </div>
      {!doc.cancelled_at && remaining > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Registrar baixa parcial ou total
          </summary>
          <div className="mt-3">
            <Form
              busy={busy}
              label="Confirmar baixa"
              submit={(form) =>
                run({
                  action: "settle_document",
                  documentId: doc.id,
                  amountCents: amount(form, "amount"),
                  paidOn: text(form, "date"),
                  account: text(form, "account") as "bank" | "cash",
                })
              }
            >
              <Field
                label="Valor da baixa (R$)"
                name="amount"
                type="number"
                value={(remaining / 100).toFixed(2)}
              />
              <Field
                label="Data efetiva"
                name="date"
                type="date"
                value={data.today}
              />
              <label className="block text-sm">
                Origem / destino
                <select className={inputClass} name="account">
                  <option value="bank">Banco / Pix</option>
                  <option value="cash">Dinheiro no caixa</option>
                </select>
              </label>
            </Form>
          </div>
        </details>
      )}
      {data.settlements
        .filter((s) => s.document_id === doc.id)
        .map((s) => (
          <details key={s.id} className="mt-3 border-t pt-3 text-sm">
            <summary className="cursor-pointer">
              {s.reversed_at ? "Estornada" : "Baixa"} de {brl(s.amount_cents)}{" "}
              em {s.paid_on}
            </summary>
            {!s.reversed_at && (
              <div className="mt-3">
                <Form
                  busy={busy}
                  label="Estornar esta baixa"
                  submit={(form) =>
                    run({
                      action: "reverse_settlement",
                      settlementId: s.id,
                      reason: text(form, "reason"),
                    })
                  }
                >
                  <Field label="Motivo do estorno" name="reason" />
                </Form>
              </div>
            )}
          </details>
        ))}
      {!doc.cancelled_at && Number(doc.paid_cents) === 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-red-700">
            Cancelar conta
          </summary>
          <Form
            busy={busy}
            label="Confirmar cancelamento"
            submit={(form) =>
              run({
                action: "cancel_document",
                documentId: doc.id,
                reason: text(form, "reason"),
              })
            }
          >
            <Field label="Motivo do cancelamento" name="reason" />
          </Form>
        </details>
      )}
    </article>
  );
}
function Documents({
  data,
  run,
  busy,
}: {
  data: FinancialSnapshot;
  run: Run;
  busy: boolean;
}) {
  const [kind, setKind] = useState<"payable" | "receivable">("payable");
  const [filter, setFilter] = useState("open");
  const docs = data.documents.filter(
    (d) =>
      filter === "all" ||
      (!d.cancelled_at && Number(d.paid_cents) < Number(d.amount_cents)),
  );
  return (
    <div className="space-y-5">
      <section className="command-card p-5">
        <h2 className="section-title mb-4">Nova conta</h2>
        <Form
          busy={busy}
          label="Cadastrar conta"
          submit={(form) =>
            run({
              action: "create_document",
              kind,
              title: text(form, "title"),
              contact: text(form, "contact"),
              category: text(form, "category") as "operating" | "other_income",
              amountCents: amount(form, "amount"),
              competenceDate: text(form, "competence"),
              dueDate: text(form, "due"),
            })
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Tipo
              <select
                className={inputClass}
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option value="payable">Conta a pagar</option>
                <option value="receivable">Conta a receber</option>
              </select>
            </label>
            <label className="block text-sm">
              Categoria
              <select className={inputClass} name="category" key={kind}>
                {kind === "receivable" ? (
                  <option value="other_income">Outras receitas</option>
                ) : (
                  <>
                    <option value="operating">Despesa operacional</option>
                    <option value="tax">Tributos</option>
                    <option value="stock">Compra de estoque</option>
                    <option value="capital">Investimento</option>
                  </>
                )}
              </select>
            </label>
            <Field label="Descrição" name="title" />
            <Field
              label="Fornecedor / cliente"
              name="contact"
              required={false}
            />
            <Field label="Valor total (R$)" name="amount" type="number" />
            <Field
              label="Competência"
              name="competence"
              type="date"
              value={data.today}
            />
            <Field
              label="Vencimento"
              name="due"
              type="date"
              value={data.today}
            />
          </div>
          <p className="text-xs text-neutral-500">
            Vendas do restaurante já entram automaticamente. Compras de estoque
            precisam também de entrada física no estoque.
          </p>
        </Form>
      </section>
      <div className="flex items-center justify-between">
        <h2 className="section-title">Contas cadastradas</h2>
        <select
          aria-label="Filtrar contas"
          className="rounded-lg border p-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="open">Em aberto</option>
          <option value="all">Todas</option>
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            data={data}
            run={run}
            busy={busy}
          />
        ))}
      </div>
      {!docs.length && (
        <p className="rounded-xl bg-white p-5 text-neutral-500">
          Nenhuma conta neste filtro.
        </p>
      )}
    </div>
  );
}
function Summary({ data }: { data: FinancialSnapshot }) {
  const amountOf = (code: string) =>
    Number(data.accounts.find((a) => a.code === code)?.balance_cents || 0);
  const open = data.documents.filter(
    (d) => !d.cancelled_at && Number(d.amount_cents) > Number(d.paid_cents),
  );
  const payable = open
    .filter((d) => d.kind === "payable")
    .reduce((sum, d) => sum + Number(d.amount_cents) - Number(d.paid_cents), 0);
  const receivable = open
    .filter((d) => d.kind === "receivable")
    .reduce((sum, d) => sum + Number(d.amount_cents) - Number(d.paid_cents), 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Banco / Pix", amountOf("bank")],
        ["Dinheiro", amountOf("cash")],
        ["Cartões a liquidar", amountOf("cards")],
        ["Contas a pagar", payable],
        ["Outras contas a receber", receivable],
        ["Recebimentos no período", Number(data.metrics.receipts_cents)],
        ["Saídas no período", Number(data.metrics.outflows_cents)],
        ["Receita líquida de estornos", Number(data.metrics.revenue_cents)],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <p className="text-sm text-neutral-500">{label}</p>
          <strong className="mt-2 block text-2xl tracking-tight">
            {brl(value)}
          </strong>
        </div>
      ))}
    </div>
  );
}
function ServicePayout({
  data,
  run,
  busy,
}: {
  data: FinancialSnapshot;
  run: Run;
  busy: boolean;
}) {
  const available = -Number(
    data.accounts.find((a) => a.code === "service_payable")?.balance_cents || 0,
  );
  return (
    <section className="command-card p-5">
      <h2 className="section-title">
        Taxa de serviço a repassar: {brl(available)}
      </h2>
      <p className="my-3 text-sm text-neutral-500">
        A taxa de serviço é separada da receita de pratos. Registre somente
        repasses já realizados.
      </p>
      <Form
        busy={busy}
        label="Registrar repasse à equipe"
        submit={(form) =>
          run({
            action: "service_payout",
            amountCents: amount(form, "amount"),
            account: text(form, "account") as "cash" | "bank",
            description: text(form, "description"),
          })
        }
      >
        <Field label="Valor do repasse (R$)" name="amount" type="number" />
        <Field label="Responsável / comprovante" name="description" />
        <label className="block text-sm">
          Conta de saída
          <select className={inputClass} name="account">
            <option value="bank">Banco / Pix</option>
            <option value="cash">Dinheiro no caixa</option>
          </select>
        </label>
      </Form>
    </section>
  );
}
function CashFlow({ data }: { data: FinancialSnapshot }) {
  const balance = data.accounts
    .filter((a) => ["cash", "bank"].includes(a.code))
    .reduce((s, a) => s + Number(a.balance_cents), 0);
  const docs = data.documents
    .filter(
      (d) => !d.cancelled_at && Number(d.amount_cents) > Number(d.paid_cents),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const rows = docs.reduce<
    Array<{ doc: FinancialDocument; amount: number; projected: number }>
  >((rows, doc) => {
    const amount =
      (Number(doc.amount_cents) - Number(doc.paid_cents)) *
      (doc.kind === "receivable" ? 1 : -1);
    return [
      ...rows,
      { doc, amount, projected: (rows.at(-1)?.projected ?? balance) + amount },
    ];
  }, []);
  return (
    <section className="command-card p-5">
      <h2 className="section-title">Fluxo de caixa previsto</h2>
      <p className="my-2 text-sm text-neutral-500">
        Parte do saldo registrado de {brl(balance)}.{" "}
        {!data.bankOpeningRegistered &&
          "O saldo bancário inicial ainda não foi informado; a projeção mostra somente os movimentos cadastrados."}{" "}
        Contas vencidas aparecem primeiro. Cartões sem data confirmada ficam
        fora da projeção.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Vencimento</th>
              <th>Conta</th>
              <th>Entrada / saída</th>
              <th>Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ doc: d, amount, projected }) => {
              return (
                <tr key={d.id} className="border-b">
                  <td className="p-3 whitespace-nowrap">{d.due_date}</td>
                  <td>{d.title}</td>
                  <td
                    className={amount < 0 ? "text-red-700" : "text-emerald-700"}
                  >
                    {brl(amount)}
                  </td>
                  <td
                    className={
                      projected < 0
                        ? "font-semibold text-red-700"
                        : "font-semibold"
                    }
                  >
                    {brl(projected)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!docs.length && (
        <p className="mt-5 text-sm">Nenhuma conta em aberto para projetar.</p>
      )}
    </section>
  );
}
function Results({ data }: { data: FinancialSnapshot }) {
  const incomplete =
    data.cards.length > 0 ||
    Number(data.waste.incomplete) > 0 ||
    data.dishes.some(
      (d) => Number(d.missing_items) > 0 || Number(d.partial_items) > 0,
    );
  const cost =
    data.dishes.reduce((sum, d) => sum + Number(d.cost_cents), 0) +
    Number(data.waste.cost_cents);
  const contribution =
    Number(data.metrics.revenue_cents) - cost - Number(data.metrics.fees_cents);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Custos de receitas registrados", cost],
          [
            "Despesas e tributos por competência",
            Number(data.metrics.expenses_cents),
          ],
          ["Taxas conciliadas", Number(data.metrics.fees_cents)],
        ].map(([label, value]) => (
          <div className="command-card p-5" key={label}>
            <p className="text-sm text-neutral-500">{label}</p>
            <strong className="text-2xl">{brl(value)}</strong>
          </div>
        ))}
      </div>
      <section className="command-card p-5">
        <h2 className="section-title">
          Resultado gerencial {incomplete ? "parcial" : ""}
        </h2>
        <p className="mt-2 text-3xl font-semibold">
          {brl(contribution - Number(data.metrics.expenses_cents))}
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Receitas e estornos do período menos custos registrados de produção,
          taxas conciliadas e despesas por competência.{" "}
          {incomplete
            ? "Há custos ou taxas de cartão pendentes; este valor não representa lucro líquido."
            : "Depende do cadastro completo das despesas, tributos e custos."}
        </p>
        {Number(data.sales.legacy_count) > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            {data.sales.legacy_count} pedido(s) anteriores à atualização
            preservados no histórico, sem inventar custos ou lançamentos
            retroativos.
          </p>
        )}
      </section>
      <section className="command-card p-5">
        <h2 className="section-title mb-4">
          Margem por prato antes de estornos
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">Item</th>
                <th>Qtd.</th>
                <th>Venda</th>
                <th>Custo registrado</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {data.dishes.map((d) => (
                <tr className="border-b" key={d.name}>
                  <td className="p-3">
                    <strong>{d.name}</strong>
                    <p className="text-xs text-amber-700">
                      {Number(d.missing_items)
                        ? "Custo ausente em parte das vendas"
                        : Number(d.partial_items)
                          ? "Custo parcial"
                          : "Custo completo declarado"}
                    </p>
                  </td>
                  <td>{d.quantity}</td>
                  <td>{brl(d.revenue_cents)}</td>
                  <td>{brl(d.cost_cents)}</td>
                  <td>
                    {Number(d.missing_items)
                      ? "Indisponível"
                      : brl(Number(d.revenue_cents) - Number(d.cost_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export function FinanceWorkspace({
  initialTab = "summary",
}: {
  initialTab?: string;
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState(initialTab);
  const { data, error, run, busy, reload } = useFinance(from, to);
  const tabs = [
    ["summary", "Visão geral"],
    ["cash", "Caixa"],
    ["documents", "Contas"],
    ["flow", "Fluxo de caixa"],
    ["results", "Resultados"],
    ["reconcile", "Conciliação"],
    ["export", "Contabilidade"],
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Gestor Food
          </p>
          <h2 className="text-2xl font-semibold">Financeiro</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Operação, caixa e resultados em uma base única.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-xs">
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </header>
      <nav
        aria-label="Seções financeiras"
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium ${tab === id ? "bg-neutral-900 text-white" : "border bg-white"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}{" "}
          <button onClick={() => void reload()} className="underline">
            Atualizar
          </button>
        </div>
      )}
      {!data ? (
        <p>Carregando financeiro…</p>
      ) : (
        <>
          {tab === "summary" && (
            <>
              <Summary data={data} />
              <CashFlow data={data} />
              <details className="command-card p-5">
                <summary className="cursor-pointer font-semibold">
                  Informar saldo bancário inicial
                </summary>
                <div className="mt-3">
                  <Form
                    busy={busy}
                    label="Registrar saldo inicial"
                    submit={(form) =>
                      run({
                        action: "opening_bank",
                        amountCents: amount(form, "amount"),
                        description: text(form, "description"),
                      })
                    }
                  >
                    <Field
                      label="Saldo inicial (R$)"
                      name="amount"
                      type="number"
                    />
                    <Field
                      label="Referência da conferência"
                      name="description"
                    />
                    <p className="text-xs text-neutral-500">
                      Disponível uma única vez. Este lançamento não é receita.
                    </p>
                  </Form>
                </div>
              </details>
            </>
          )}
          {tab === "cash" && (
            <CashControls shifts={data.shifts} run={run} busy={busy} />
          )}{" "}
          {tab === "documents" && (
            <>
              <Documents data={data} run={run} busy={busy} />
              <ServicePayout data={data} run={run} busy={busy} />
            </>
          )}{" "}
          {tab === "flow" && <CashFlow data={data} />}{" "}
          {tab === "results" && <Results data={data} />}{" "}
          {tab === "reconcile" && (
            <section className="space-y-4">
              <h2 className="section-title">Conciliação manual de cartões</h2>
              <p className="text-sm text-neutral-500">
                Confira o crédito no extrato da adquirente e informe o líquido
                recebido. A taxa é a diferença entre bruto e líquido.
              </p>
              {data.cards.map((p) => (
                <article key={p.id} className="command-card p-5">
                  <h3 className="mb-3 font-semibold">
                    Pedido #{p.order_number} ·{" "}
                    {p.method === "credit" ? "Crédito" : "Débito"} · Bruto{" "}
                    {brl(p.amount_cents)}
                  </h3>
                  <Form
                    busy={busy}
                    label="Confirmar crédito no banco"
                    submit={(form) =>
                      run({
                        action: "reconcile_card",
                        paymentId: p.id,
                        netCents: amount(form, "net"),
                        paidOn: text(form, "date"),
                        reference: text(form, "reference"),
                      })
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Valor líquido (R$)"
                        name="net"
                        type="number"
                      />
                      <Field
                        label="Data do crédito"
                        name="date"
                        type="date"
                        value={data.today}
                      />
                      <Field label="Referência / NSU" name="reference" />
                    </div>
                  </Form>
                </article>
              ))}
              {!data.cards.length && (
                <p className="command-card p-5">
                  Nenhum cartão aguardando conciliação.
                </p>
              )}
            </section>
          )}{" "}
          {tab === "export" && (
            <section className="command-card p-5">
              <h2 className="section-title">Exportação para contabilidade</h2>
              <p className="my-3 text-sm text-neutral-500">
                CSV de lançamentos gerenciais por competência, com conta,
                débito, crédito, origem e responsável. Valores em centavos; não
                substitui arquivos fiscais.
              </p>
              <a
                className="primary-button"
                href={`/api/operations/finance/export?from=${from}&to=${to}`}
              >
                Baixar lançamentos do período
              </a>
              <p className="mt-4 text-sm text-amber-800">
                XML e DANFE estarão disponíveis após configurar e homologar a
                emissão fiscal.
              </p>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Data / lançamento</th>
                      <th>Conta</th>
                      <th>Débito</th>
                      <th>Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.map((m) => (
                      <tr className="border-t" key={m.id}>
                        <td className="p-2">
                          {m.effective_date}
                          <p>{m.description}</p>
                          <small>{m.actor_name}</small>
                        </td>
                        <td>{m.account}</td>
                        <td>{brl(m.debit_cents)}</td>
                        <td>{brl(m.credit_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Tela: até 400 linhas. Exportação: período completo.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
