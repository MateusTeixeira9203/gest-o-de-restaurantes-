"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useRestaurant } from "@/lib/restaurant-store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { emptyOptions, type FiscalOptions } from "@/modules/fiscal/schema";
import type { FiscalAccount } from "@/modules/fiscal/accounts";
import { Settings, ExportPanel, RecipientFields, FiscalDocumentCard, type Overview } from "./fiscal-details";

type Environment = "homologation" | "production";
type Filter = "pending" | "issued" | "problem" | "all";
type Result = { key: string; label?: string; documentId?: string; status: string; message: string };
type List = { accounts: FiscalAccount[]; counts: Record<Filter, number>; page: number; pages: number; total: number; enabled: boolean; environment: Environment };
const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const labels = { pending: "Não emitida", issued: "Emitida", problem: "Precisa corrigir", processing: "Aguardando autorização", cancelled: "Cancelada" };
const environmentKey = "restio-fiscal-environment";
function storedEnvironment(): Environment { return typeof window !== "undefined" && sessionStorage.getItem(environmentKey) === "production" ? "production" : "homologation"; }
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir a operação.");
  return body as T;
}
const errorText = (e: unknown) => e instanceof Error && !(e instanceof TypeError) && !(e instanceof SyntaxError) ? e.message : "Conexão interrompida. Atualize a lista antes de repetir; uma solicitação pode já ter sido registrada.";

export function FiscalWorkspace() {
  const { session } = useRestaurant();
  const manager = ["admin", "manager"].includes(session?.role || "");
  const [environment] = useState<Environment>(storedEnvironment);
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [filter, setFilter] = useState<Filter>("pending"), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState<List | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [confirm, setConfirm] = useState<FiscalAccount[] | null>(null);
  const [activation, setActivation] = useState<FiscalAccount[] | null>(null);
  const [options, setOptions] = useState<FiscalOptions>(emptyOptions), [detail, setDetail] = useState<FiscalAccount | null>(null), [exportOpen, setExportOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]), [busy, setBusy] = useState(false);
  const lock = useRef(false), request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await json<List>("/api/operations/fiscal/accounts?" + new URLSearchParams({ from, to, environment, status: filter, search, page: String(page) }), { signal: controller.signal });
      if (!controller.signal.aborted) { setData(result); setError(""); }
    } catch (e) { if (!controller.signal.aborted) { setError(errorText(e)); setData(null); } }
    finally { if (request.current === controller) request.current = null; }
  }, [from, to, environment, filter, search, page]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => { clearTimeout(timer); request.current?.abort(); }; }, [load]);
  const hasPending = data?.accounts.some(a => a.status === "processing");
  useEffect(() => { if (!hasPending || busy) return; const timer = setInterval(() => { if (!request.current) void load(); }, 15000); return () => clearInterval(timer); }, [hasPending, busy, load]);
  function resetSelection() { setSelected([]); setPage(1); }
  function openConfirm(accounts: FiscalAccount[]) { setOptions(emptyOptions); if (data?.enabled) setConfirm(accounts); else setActivation(accounts); setResults([]); }
  async function submit() {
    if (!confirm || lock.current || !data) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await json<{ results: Result[] }>("/api/operations/fiscal/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ environment, action: data.enabled ? "issue" : "validate", accounts: confirm.map(a => ({ key: a.key, ...(confirm.length === 1 && (JSON.stringify(options) !== JSON.stringify(emptyOptions)) ? { options } : {}) })) }) });
      setResults(response.results.map(r => ({ ...r, label: confirm.find(a => a.key === r.key)?.label + " · Conta " + confirm.find(a => a.key === r.key)?.number }))); setSelected([]); setConfirm(null);
      // All items were durably queued before any provider call. One bounded request per document.
      for (const item of response.results.filter(r => r.status === "queued" && r.documentId)) {
        try {
          const outcome = await json<{ status?: string }>("/api/operations/fiscal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", documentId: item.documentId }) });
          setResults(old => old.map(r => r.key === item.key ? { ...r, status: outcome.status || "pending", message: outcome.status === "succeeded" ? "Nota autorizada." : outcome.status === "failed" ? "Emissão rejeitada. Veja o motivo nos detalhes." : "Aguardando confirmação. Consulte o resultado nos detalhes." } : r));
        } catch (e) { setResults(old => old.map(r => r.key === item.key ? { ...r, status: "unknown", message: errorText(e) } : r)); }
      }
      await load();
    } catch (e) { setError(errorText(e)); setConfirm(null); await load(); setError(errorText(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="fiscal-sales space-y-5" aria-busy={busy}>
    <header className="fiscal-sales-header"><div><h2>Notas fiscais</h2><p>Uma nota por conta fechada. Acompanhe a emissão aqui.</p></div><div className="fiscal-secondary-actions"><button className="secondary-button" onClick={() => setExportOpen(true)}>Exportar para contador</button>{manager && <Link className="secondary-button" href="/gestao/configuracoes/fiscal" aria-label="Configurações fiscais"><SettingsIcon size={18} /></Link>}</div></header>
    <p className={`fiscal-connection ${environment === "homologation" ? "test" : ""}`}><strong>{environment === "homologation" ? "Ambiente de testes — sem validade fiscal" : "Produção — notas reais"}</strong><span>{data?.enabled ? "Conexão habilitada" : "A emissão aguarda configuração. Clique em Emitir nota para ver o próximo passo."}</span></p>
    <div className="fiscal-filters"><label>Período<select aria-label="Período fiscal" disabled={busy} value={preset} onChange={e => { setPreset(e.target.value); resetSelection(); if (e.target.value === "today") { setFrom(today()); setTo(today()); } else if (e.target.value === "yesterday") { const date = new Date(`${today()}T12:00:00-03:00`); date.setDate(date.getDate() - 1); const day = date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); setFrom(day); setTo(day); } }}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="custom">Escolher datas</option></select></label><label>De<input type="date" aria-label="De" value={from} disabled={busy} onChange={e => { setPreset("custom"); setFrom(e.target.value); resetSelection(); }} /></label><label>Até<input type="date" aria-label="Até" value={to} disabled={busy} onChange={e => { setPreset("custom"); setTo(e.target.value); resetSelection(); }} /></label><label className="fiscal-search">Buscar<input placeholder="Mesa, conta ou número da nota" value={search} disabled={busy} onChange={e => { setSearch(e.target.value); resetSelection(); }} /></label><button className="secondary-button" disabled={busy} onClick={() => void load()} aria-label="Atualizar notas"><RefreshCw size={18} /></button></div>
    <nav className="workspace-tabs" aria-label="Situação das notas">{([['pending','Pendentes'],['issued','Emitidas'],['problem','Com problema'],['all','Todas']] as const).map(([id,label]) => <button className="secondary-button" key={id} aria-pressed={filter === id} disabled={busy} onClick={() => { setFilter(id); resetSelection(); }}>{label}{data ? ` · ${data.counts[id]}` : ""}</button>)}</nav>
    {error && <p role="alert" className="fiscal-error">{error}</p>}
    {results.length > 0 && <div className="command-card p-4" role="status"><strong>Resultado por conta</strong><ul className="mt-2 space-y-2">{results.map(r => <li key={r.key} className="text-sm">{r.label || "Conta"} · {r.message}{r.documentId && <button className="text-button ml-2" onClick={() => setDetail({ key: r.key, number: "", label: "Documento fiscal", total: 0, orders: [], closedAt: "", status: "pending", documents: [{ id: r.documentId!, status: r.status, blockers: [] }] })}>Ver detalhes</button>}</li>)}</ul></div>}
    {busy && <p role="status">Processando as contas selecionadas. Os resultados são individuais.</p>}
    {!data && !error && <p role="status">Carregando contas…</p>}
    {data && <>
      {data.accounts.some(a => a.status === "pending") && <label className="fiscal-select-all"><input type="checkbox" disabled={busy} checked={selected.length > 0 && data.accounts.filter(a => a.status === "pending").slice(0,20).every(a => selected.includes(a.key))} onChange={e => setSelected(e.target.checked ? data.accounts.filter(a => a.status === "pending").slice(0,20).map(a => a.key) : [])} />Selecionar até 20 contas desta página</label>}
      {selected.length > 0 && <div className="fiscal-batch-bar"><span>{selected.length} contas selecionadas · Uma nota por conta</span><button className="primary-button" disabled={busy} onClick={() => openConfirm(data.accounts.filter(a => selected.includes(a.key)))}>{`Emitir ${selected.length} ${selected.length === 1 ? "nota" : "notas"}`}</button></div>}
      <div className="fiscal-account-list">{data.accounts.map(a => <article className="fiscal-account-row" key={a.key}>
        <input type="checkbox" aria-label={`Selecionar ${a.label} conta ${a.number}`} checked={selected.includes(a.key)} disabled={busy || a.status !== "pending" || (!selected.includes(a.key) && selected.length >= 20)} onChange={e => setSelected(v => e.target.checked ? [...v,a.key] : v.filter(k => k !== a.key))} />
        <time dateTime={a.closedAt}>{new Date(a.closedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</time>
        <div className="fiscal-account-name"><h3>{a.label} · Conta {a.number}</h3><p>{a.orders.length} {a.orders.length === 1 ? "pedido" : "pedidos"}</p></div><strong>{money(a.total)}</strong><span className={`fiscal-status ${a.status}`}>{labels[a.status]}</span>
        <div className="fiscal-row-actions">{a.status === "pending" && <button disabled={busy} className="primary-button" onClick={() => openConfirm([a])}>Emitir nota</button>}{a.documents.length > 0 && <button className="secondary-button" disabled={busy} onClick={() => setDetail(a)}>{a.status === "issued" ? "Ver nota" : a.status === "problem" ? "Resolver" : "Ver detalhes"}</button>}</div>
      </article>)}</div>
      {!data.accounts.length && <div className="command-card p-6"><p>Nenhuma conta neste filtro.</p><p className="mt-1 text-sm text-neutral-500">Contas aparecem depois de concluídas. Confira o período ou escolha Todas.</p></div>}
      <div className="fiscal-list-footer"><span>{data.total} {data.total === 1 ? "conta" : "contas"} · Página {data.page} de {data.pages}</span><div><button className="secondary-button" disabled={busy || data.page <= 1} onClick={() => { setSelected([]); setPage(data.page-1); }}>Anterior</button><button className="secondary-button" disabled={busy || data.page >= data.pages} onClick={() => { setSelected([]); setPage(data.page+1); }}>Próxima</button></div></div>
    </>}
    <Dialog open={!!activation} onOpenChange={open => { if (!open) setActivation(null); }}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg"><DialogHeader><DialogTitle>Falta configurar a emissão</DialogTitle><DialogDescription>Você poderá emitir por aqui, uma nota por conta. Neste momento, nenhuma nota será enviada.</DialogDescription></DialogHeader><div className="fiscal-setup-help"><p><strong>1. Dados do restaurante</strong><span>O CNPJ e o cadastro fiscal da sua empresa são preenchidos uma vez.</span></p><p><strong>2. Conexão com a Focus NFe</strong><span>A implantação configura certificado, credenciais e autorização para emitir.</span></p><p><strong>3. Conferência com o contador</strong><span>Valide as regras dos produtos antes de começar a emissão real.</span></p></div><p className="text-sm text-neutral-600">Os dados do consumidor não substituem os do restaurante. Na venda presencial comum, você pode emitir sem CPF/CNPJ do cliente, quando permitido.</p><div className="flex flex-wrap gap-3">{manager ? <Link href="/gestao/configuracoes/fiscal" className="primary-button">Abrir configuração fiscal</Link> : <p>Peça à gestão para concluir a configuração fiscal.</p>}<button className="secondary-button" onClick={() => { setConfirm(activation); setActivation(null); }}>Só conferir os dados, sem emitir</button></div></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg"><DialogHeader><DialogTitle>{data?.enabled ? "Confirmar emissão" : "Conferir contas"}</DialogTitle><DialogDescription>{data?.enabled ? `${confirm?.length || 0} nota(s), uma para cada conta. ${environment === "homologation" ? "Somente em homologação, sem validade fiscal." : "Documentos reais em produção."}` : "Somente validação interna. Nenhuma nota será enviada à Focus ou à SEFAZ."}</DialogDescription></DialogHeader><ul className="space-y-2">{confirm?.map(a => <li key={a.key} className="flex justify-between gap-4"><span>{a.label} · Conta {a.number}</span><strong>{money(a.total)}</strong></li>)}</ul><p className="fiscal-issuer-note">Quem emite é o restaurante, com o cadastro fiscal salvo. O cliente só precisa ser identificado quando solicitar ou quando a operação exigir.</p>{confirm?.length === 1 && <RecipientFields value={options} onChange={setOptions} />}<div className="flex justify-end gap-3"><button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>Voltar</button><button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Conferindo…" : data?.enabled ? "Confirmar emissão" : "Confirmar conferência"}</button></div></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) { setDetail(null); void load(); } }}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{detail?.label} {detail?.number && `· Conta ${detail.number}`}</DialogTitle><DialogDescription>Nota, pendências e arquivos desta conta.</DialogDescription></DialogHeader>{detail?.issue && <p role="alert" className="fiscal-error">{detail.issue}</p>}{detail && <DocumentDetails key={detail.key} ids={detail.documents.map(d => d.id)} environment={environment} onChanged={load} />}</DialogContent></Dialog>
    <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl"><DialogHeader><DialogTitle>Exportar para contador</DialogTitle><DialogDescription>Baixe os documentos e confira as pendências do período.</DialogDescription></DialogHeader><ExportPanel environment={environment} /></DialogContent></Dialog>
  </section>;
}
function useOverview(environment: Environment, ids?: string) {
  const [data,setData] = useState<Overview | null>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => { controller.current?.abort(); const current = new AbortController(); controller.current=current; try { const result=await json<Overview>(`/api/operations/fiscal?environment=${environment}${ids ? `&documents=${ids}` : ""}`,{signal:current.signal}); if (!current.signal.aborted) { setData(result); setError(""); } } catch(e) { if (!current.signal.aborted) setError(errorText(e)); } },[environment,ids]);
  // This effect subscribes to the remote overview; all state updates follow the HTTP response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => controller.current?.abort(); },[load]);
  async function run(command: unknown) { if (pending.current) return false; pending.current=true;setBusy(true); try { await json("/api/operations/fiscal",{method:"POST",headers:{"Content-Type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify(command)});await load();return true; }catch(e){setError(errorText(e));return false;}finally{pending.current=false;setBusy(false);} }
  return {data,error,busy,run,load};
}
function DocumentDetails({ids,environment,onChanged}:{ids:string[];environment:Environment;onChanged:()=>Promise<void>}) {
  const {data,error,busy,run}=useOverview(environment,ids.join(","));
  return <>{error && <p role="alert" className="fiscal-error">{error}</p>}{!data && !error && <p>Carregando documento…</p>}{data?.documents.map(d=><FiscalDocumentCard key={d.id} d={d} environment={environment} enabled={data.enabled} busy={busy} run={async c=>{const ok=await run(c);await onChanged();return ok;}} />)}</>;
}
type ConfigurationTab = "company"|"tax"|"connection";
export function FiscalConfiguration() {
  const [tab,setTab]=useState<ConfigurationTab>("company");
  const [environment,setEnvironment]=useState<Environment>(storedEnvironment);
  return <section className="fiscal-settings space-y-5"><div className="fiscal-settings-heading"><div><h3>Emissão de notas fiscais</h3><p>Cadastre o restaurante uma vez. Depois, emita pela lista de contas.</p></div><Link href="/gestao/fiscal" className="secondary-button"><ArrowLeft size={18}/>Ir para as notas</Link></div><ConfigurationContent key={environment} tab={tab} onTabChange={setTab} environment={environment} onEnvironmentChange={value => {sessionStorage.setItem(environmentKey,value);setEnvironment(value);}}/></section>;
}
function ConfigurationContent({environment,onEnvironmentChange,tab,onTabChange}:{environment:Environment;onEnvironmentChange:(value:Environment)=>void;tab:ConfigurationTab;onTabChange:(value:ConfigurationTab)=>void}) {
  const {data,error,busy,run}=useOverview(environment);
  return <>{error && <p role="alert" className="fiscal-error">{error}</p>}{!data && !error && <p>Carregando configuração…</p>}{data && <>
    <div className="fiscal-setup-status"><strong>{data.enabled ? (environment === "production" ? "Conexão de produção habilitada" : "Ambiente de testes habilitado") : "Emissão ainda não habilitada"}</strong><p>{data.issuer.legalName || "Cadastre sua empresa para identificar quem emite as notas."}{data.issuer.cnpj ? ` · CNPJ ${data.issuer.cnpj}` : ""}</p><p>{environment === "homologation" ? "Homologação: documentos sem validade fiscal." : "Produção: documentos fiscais reais."}</p></div>
    <nav className="workspace-tabs" aria-label="Configuração das notas">{([["company","Dados da empresa"],["tax","Produtos e impostos"],["connection","Conexão Focus"]] as const).map(([id,label])=><button className="secondary-button" key={id} disabled={busy} aria-pressed={tab===id} onClick={()=>onTabChange(id)}>{label}</button>)}</nav>
    <div hidden={tab === "connection"}><Settings data={data} run={run} busy={busy} section={tab === "tax" ? "tax" : "company"}/></div>
    <section hidden={tab !== "connection"} className="settings-card"><h3>Conexão com a Focus NFe</h3><p>A equipe de implantação configura a API por restaurante, em ambiente seguro. Não é necessário preencher uma chave a cada venda.</p><div className="fiscal-setup-help"><p><strong>O restaurante fornece</strong><span>Cadastro da empresa, acesso contratado à Focus e os documentos exigidos para o credenciamento.</span></p><p><strong>A implantação configura</strong><span>Certificado, CSC e credenciais no provedor/servidor. Após os testes e a liberação fiscal, a emissão real é habilitada.</span></p></div><label className="admin-field"><span>Ambiente de trabalho nesta sessão</span><select aria-label="Ambiente fiscal" value={environment} disabled={busy} onChange={e=>onEnvironmentChange(e.target.value as Environment)}><option value="homologation">Homologação — testes</option><option value="production">Produção — documentos reais</option></select></label><p className="settings-hint">Trocar esta seleção não configura a API nem autoriza emissão. Ela muda apenas o ambiente consultado nesta sessão.</p></section>
  </>}</>;
}
