"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";

type Role = "manager" | "waiter" | "kitchen" | "cashier" | "delivery";
type Member = { id: string; name: string; role: Role; active: boolean };

const roleLabel: Record<Role, string> = { manager: "Gestão", waiter: "Garçom", kitchen: "Cozinha", cashier: "Caixa", delivery: "Entrega" };

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a ação.";
}

export function TeamManagement() {
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/operations/team", { cache: "no-store" });
    if (!response.ok) { toast.error(await responseError(response)); setLoading(false); return; }
    const body = await response.json() as { team: Member[] };
    setTeam(body.team); setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    const response = await fetch("/api/operations/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, role, pin }) });
    setSaving(false);
    if (!response.ok) { toast.error(await responseError(response)); return; }
    setName(""); setPin(""); toast.success("Pessoa adicionada à equipe."); await load();
  };

  const toggle = async (member: Member) => {
    const response = await fetch(`/api/operations/team/${member.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !member.active }) });
    if (!response.ok) { toast.error(await responseError(response)); return; }
    toast.success(member.active ? "Acesso desativado." : "Acesso reativado."); await load();
  };

  const resetPin = async (member: Member) => {
    const nextPin = window.prompt(`Novo PIN de 4 a 6 números para ${member.name}:`);
    if (nextPin === null) return;
    const response = await fetch(`/api/operations/team/${member.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: nextPin }) });
    if (!response.ok) { toast.error(await responseError(response)); return; }
    toast.success("PIN atualizado.");
  };

  return <section className="settings-card mt-6">
    <div className="card-heading"><div><h3>Equipe e acesso rápido</h3><p>Nome e PIN curto para começar o turno. O PIN nunca fica visível.</p></div></div>
    <form onSubmit={add} className="mt-5 grid gap-3 sm:grid-cols-[1.3fr_1fr_.8fr_auto]">
      <label><span>Nome</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Ana" maxLength={80} required /></label>
      <label><span>Função</span><select value={role} onChange={event => setRole(event.target.value as Role)}>{(Object.keys(roleLabel) as Role[]).map(value => <option value={value} key={value}>{roleLabel[value]}</option>)}</select></label>
      <label><span>PIN</span><input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{4,6}" placeholder="4 a 6 números" required /></label>
      <button className="primary-button self-end" disabled={saving}>{saving ? "Salvando…" : <><Plus size={17} /> Adicionar</>}</button>
    </form>
    <div className="mt-6 divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
      {loading ? <p className="p-5 text-sm text-neutral-500">Carregando equipe…</p> : team.length ? team.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{member.name}</strong><p className="mt-1 text-sm text-neutral-500">{roleLabel[member.role]} · {member.active ? "Acesso ativo" : "Acesso desativado"}</p></div><div className="flex gap-2"><button type="button" onClick={() => resetPin(member)} className="secondary-button"><KeyRound size={15} /> PIN</button><button type="button" onClick={() => void toggle(member)} className="secondary-button">{member.active ? <><UserRoundX size={15} /> Desativar</> : <><UserRoundCheck size={15} /> Reativar</>}</button></div></div>) : <p className="p-5 text-sm text-neutral-500">Ainda não há ninguém cadastrado. Comece pelo responsável de cada área.</p>}
    </div>
  </section>;
}
