"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { MenuBuilder } from "@/components/cardapio/cardapio";
import { Topbar } from "@/components/shared/blocos";
import { Carregando, Vazio } from "@/components/shared/estados";
import { SeloEstado, type TomEstado } from "@/components/shared/selos";
import { PendingOrders } from "@/components/pending-orders";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, tableTotal, type TableStatus } from "@/lib/domain";

const mesaEstado: Record<TableStatus, { texto: string; tom: TomEstado }> = {
  available: { texto: "Livre", tom: "neutral" }, occupied: { texto: "Ocupada", tom: "info" },
  preparing: { texto: "Ocupada · em preparo", tom: "info" }, ready: { texto: "Pronto", tom: "ok" }, closing: { texto: "Pediu a conta", tom: "bill" },
};

export function WaiterTables() {
  const { state, ready } = useRestaurant();
  const search = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [channel, setChannel] = useState<"pickup" | "delivery" | null>(search.get("novo") === "1" ? "pickup" : null);
  if (!ready) return <main className="app-page salao-page"><div className="page-container"><Topbar title="Salão" subtitle="Carregando mesas e comandas" /><Carregando quantidade={6} mensagem="Carregando mesas e comandas…" /></div></main>;
  if (channel) return <MenuBuilder source="waiter" initialChannel={channel} onBack={() => setChannel(null)} />;
  const tables = state.tables.filter(table => table.active);
  const summary = [
    ["Livres", state.tables.filter(t => t.status === "available").length], ["Em atendimento", state.tables.filter(t => ["occupied", "preparing"].includes(t.status)).length],
    ["Prontos", state.tables.filter(t => t.status === "ready").length], ["Pediram a conta", state.tables.filter(t => t.status === "closing").length],
  ];
  return <main className="app-page salao-page"><div className="page-container">
    <Topbar title="Salão" subtitle="Escolha a mesa ou comanda" action={<div className="hidden items-center gap-2 sm:flex"><span className="sync-dot" /><span className="salao-context">Ao vivo</span></div>} />
    <div className="salao-actions"><button className="secondary-button" onClick={() => setChannel("pickup")}>Balcão</button><button className="secondary-button" onClick={() => setChannel("delivery")}>Entrega</button></div>
    <PendingOrders />
    <div className="summary-strip">{summary.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="salao-section-heading"><h2 className="section-title">Mesas</h2><span className="salao-context">{tables.length} ativas</span></div>
    {tables.length ? <section className="table-grid" aria-label="Mesas e comandas">{tables.map(table => {
      const orders = state.orders.filter(o => o.tableId === table.id && !["cancelled", "completed"].includes(o.status));
      return <Link key={table.id} href={`/operacao/garcom/mesa/${table.id}`} className={`table-card table-${table.status}`}>
        <div className="salao-table-heading"><span className="table-number">{String(table.number).padStart(2, "0")}</span>{table.status === "ready" && <Bell size={20} aria-hidden="true" />}</div>
        <SeloEstado {...mesaEstado[table.status]} />
        {table.status !== "available" ? <div className="salao-table-details"><strong>{money(tableTotal(state, table.id))}</strong><p>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p>{table.openedAt && <p>Há {Math.max(0, Math.floor((now - Date.parse(table.openedAt)) / 60000))} min</p>}</div> : <p className="salao-context">Disponível para abrir</p>}
      </Link>;
    })}</section> : <Vazio titulo="Nenhuma mesa cadastrada" descricao="O gerente cadastra em Gestão › Mesas" />}
  </div></main>;
}
