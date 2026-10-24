"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Topbar, StatusPill } from "@/components/shared/blocos";
import { PendingOrders } from "@/components/pending-orders";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal } from "@/lib/domain";

export function WaiterTables() {
  const { state } = useRestaurant();
  const summary = [
    ["Livres", state.tables.filter(t => t.status === "available").length], ["Em atendimento", state.tables.filter(t => ["occupied", "preparing"].includes(t.status)).length], ["Prontos", state.tables.filter(t => t.status === "ready").length], ["Fechamento", state.tables.filter(t => t.status === "closing").length],
  ];
  return <main className="app-page"><div className="page-container"><Topbar title="Salão" subtitle="Selecione o número para abrir a mesa ou comanda" action={<div className="hidden items-center gap-2 sm:flex"><span className="sync-dot" /> <span className="text-sm text-neutral-500">Ao vivo</span></div>} /><PendingOrders /><div className="summary-strip">{summary.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="mb-4 flex items-center justify-between"><h2 className="section-title">Mesas</h2><span className="text-sm text-neutral-500">{state.tables.filter(t => t.active).length} ativas</span></div><section className="table-grid">{state.tables.filter(t => t.active).map(table => { const orders = state.orders.filter(o => o.tableId === table.id && !["cancelled", "completed"].includes(o.status)); const total = tableTotal(state, table.id); return <Link key={table.id} href={`/operacao/garcom/mesa/${table.id}`} className={`table-card table-${table.status}`}><div className="flex items-start justify-between"><span className="table-number">{String(table.number).padStart(2, "0")}</span>{table.status === "ready" && <Bell size={18} className="text-emerald-600" />}</div><div className="mt-8"><StatusPill status={table.status} />{table.status !== "available" ? <><p className="mt-3 text-lg font-semibold">{money(total)}</p><p className="mt-1 text-xs text-neutral-500">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p></> : <p className="mt-3 text-sm text-neutral-400">Disponível para abrir</p>}</div></Link>; })}</section></div></main>;
}
