"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Download, Pencil, Plus, QrCode, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal, type Table } from "@/lib/domain";

const statusLabels = { available: "Livre", occupied: "Ocupada", preparing: "Preparando", ready: "Pedido pronto", closing: "Aguardando conta" };

export function TableQrDialog({ table, open, onOpenChange }: { table: Table | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state } = useRestaurant();
  const filename = state.settings.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "comanda-inteligente";
  const [image, setImage] = useState("");
  const url = table && typeof window !== "undefined" ? `${window.location.origin}/menu/mesa/${table.number}` : "";
  useEffect(() => { if (!open || !url) return; let cancelled = false; void import("qrcode").then(module => module.default.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M" })).then(value => { if (!cancelled) setImage(value); }).catch(() => toast.error("Não foi possível gerar o QR Code.")); return () => { cancelled = true; }; }, [open, url]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link da mesa copiado."); } catch { toast.error("Não foi possível copiar o link."); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-3xl text-center sm:max-w-sm"><DialogHeader><DialogTitle>QR Code · {table?.label}</DialogTitle><DialogDescription>Ao escanear, o cliente abre o cardápio com esta mesa identificada.</DialogDescription></DialogHeader>{image && <><img src={image} width={300} height={300} className="mx-auto rounded-2xl border border-neutral-200" alt={`QR Code da ${table?.label}`} /><p className="break-all text-xs text-neutral-500">{url}</p><div className="flex flex-wrap justify-center gap-2"><button onClick={() => void copy()} className="secondary-button"><Copy size={16} /> Copiar link</button><a href={image} download={`${filename}-mesa-${table?.number}.png`} className="primary-button"><Download size={16} /> Baixar QR</a></div></>}</DialogContent></Dialog>;
}

export function ManagementTables() {
  const { state, refresh } = useRestaurant();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "range">("single");
  const [number, setNumber] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<Table | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [busy, setBusy] = useState(false);
  const start = (table?: Table) => { setEditing(table || null); setMode("single"); setNumber(table ? String(table.number) : ""); setEnd(""); setLabel(table?.label || ""); setActive(table?.active ?? true); setOpen(true); };
  const save = async () => {
    const startNumber = Number(number), endNumber = mode === "range" ? Number(end) : startNumber;
    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1 || endNumber > 200 || endNumber < startNumber || endNumber - startNumber >= 100) { toast.error("Use números de mesa entre 1 e 200, com até 100 mesas por vez."); return; }
    if (editing && label.trim().length < 2) { toast.error("Informe uma identificação para a mesa."); return; }
    setBusy(true);
    try {
      const response = await fetch(editing ? `/api/operations/tables/${editing.number}` : "/api/operations/tables", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { label: label.trim(), active } : mode === "range" ? { start: startNumber, end: endNumber } : { number: startNumber, label: label.trim() || undefined }) });
      const result = await response.json() as { error?: string; created: number[]; skipped: number[] };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar as mesas.");
      await refresh(); setOpen(false);
      toast.success(editing ? "Mesa atualizada." : `${result.created.length} mesa(s) criada(s)${result.skipped.length ? `; ${result.skipped.length} já existiam` : ""}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar as mesas."); }
    finally { setBusy(false); }
  };
  return <><div className="page-heading"><div><h2>Mesas e comandas</h2><p>Cadastre os números e personalize o nome: Mesa 01 ou Comanda 01. O mesmo fluxo atende e fecha a conta.</p></div><button onClick={() => start()} className="primary-button"><Plus size={17} /> Adicionar mesas</button></div><div className="table-admin-summary"><span><Table2 size={17} /> {state.tables.filter(t => t.active).length} mesas ativas</span><span>{state.tables.filter(t => t.status !== "available").length} em atendimento</span></div><div className="admin-table-grid">{state.tables.map(table => <article key={table.id} className={`admin-table-card improved${table.active ? "" : " inactive"}`}><div className="flex items-start justify-between"><div><span>Número {String(table.number).padStart(2, "0")}</span><strong>{table.label}</strong></div><span className={`table-status-label table-status-${table.status}`}>{table.active ? statusLabels[table.status] : "Inativa"}</span></div><p>{table.status === "available" ? "Sem comanda aberta" : money(tableTotal(state, table.id))}</p><div className="admin-table-actions"><Link href={`/operacao/garcom/mesa/${table.number}`}>Abrir comanda</Link><button onClick={() => setQrTable(table)}><QrCode size={15} /> QR</button><button onClick={() => start(table)} aria-label={`Editar ${table.label}`}><Pencil size={15} /></button></div></article>)}</div>{!state.tables.length && <div className="empty-state"><Table2 size={28} /><p>Nenhuma mesa cadastrada. Adicione uma mesa ou uma sequência de números.</p></div>}<TableQrDialog key={qrTable?.id || "none"} table={qrTable} open={!!qrTable} onOpenChange={value => !value && setQrTable(null)} />
  <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}><DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? `Editar mesa / comanda ${editing.number}` : "Adicionar mesas"}</DialogTitle><DialogDescription>{editing ? "A identificação aparece na gestão e no salão." : "Cadastre uma mesa ou uma sequência de uma vez."}</DialogDescription></DialogHeader><div className="space-y-4">{!editing && <div className="table-mode-switch"><button className={mode === "single" ? "active" : ""} onClick={() => setMode("single")}>Uma mesa</button><button className={mode === "range" ? "active" : ""} onClick={() => setMode("range")}>Várias mesas</button></div>}<div className="grid grid-cols-2 gap-3"><label className="admin-field"><span>{mode === "range" ? "De *" : "Número *"}</span><input type="number" min="1" max="200" value={number} disabled={!!editing} onChange={e => setNumber(e.target.value)} placeholder="Ex.: 1" /></label>{mode === "range" && !editing && <label className="admin-field"><span>Até *</span><input type="number" min="1" max="200" value={end} onChange={e => setEnd(e.target.value)} placeholder="Ex.: 12" /></label>}</div>{mode === "single" && <label className="admin-field"><span>Identificação {editing ? "*" : "(opcional)"}</span><input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="Ex.: Mesa 01 ou Comanda 01" /></label>}{editing && <label className="admin-checks"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativa</label>}{mode === "range" && <p className="text-sm text-neutral-500">As mesas existentes serão preservadas; apenas as novas serão adicionadas.</p>}</div><div className="admin-dialog-actions"><button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button><button className="primary-button" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar identificação" : "Criar mesas"}</button></div></DialogContent></Dialog></>;
}
