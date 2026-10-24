"use client";

import { useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import { OrderPill, PageTitle } from "@/components/shared/blocos";
import { PendingOrders } from "@/components/pending-orders";
import { RefundOrderButton } from "@/components/refund-order-button";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, orderTotal } from "@/lib/domain";

export function ManageOrders() {
  const { state } = useRestaurant();
  const [filter, setFilter] = useState<"active" | "completed" | "cancelled">("active");
  const [search, setSearch] = useState("");
  const orders = [...state.orders].filter(order => filter === "active" ? !["completed", "cancelled"].includes(order.status) : order.status === filter).filter(order => `${order.number} ${order.tableId} ${order.customerName || ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return <><PendingOrders /><PageTitle title="Pedidos" subtitle="Acompanhe a fila e consulte o histórico sem rolar tabelas no celular." /><div className="orders-toolbar"><div className="orders-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Em andamento <span>{state.orders.filter(o => !["completed", "cancelled"].includes(o.status)).length}</span></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>Concluídos</button><button className={filter === "cancelled" ? "active" : ""} onClick={() => setFilter("cancelled")}>Cancelados</button></div><label className="admin-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pedido ou cliente" /></label></div><div className="orders-card-grid">{orders.map(order => <article key={order.id} className="orders-admin-card"><div className="flex items-start justify-between gap-3"><div><span className="text-xs text-neutral-500">{new Date(order.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span><h3>Pedido #{order.number}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><span className={`fulfillment-tag fulfillment-${order.fulfillment}`}>{order.fulfillment === "delivery" ? "Entrega" : order.fulfillment === "pickup" ? "Retirada" : "Mesa"}</span><span className="text-sm text-neutral-500">{order.fulfillment === "dine_in" ? `Mesa ${order.tableId}` : order.customerName || "Cliente"}</span></div></div><OrderPill status={order.status} /></div><div className="orders-admin-items">{order.items.map(item => <p key={item.id}>{item.quantity}× {item.productName} <span>· {item.variantName}</span></p>)}</div><div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3"><strong>{money(state.sales.find(sale => sale.orderIds.includes(order.id))?.total ?? orderTotal(order))}</strong><RefundOrderButton order={order} />{!["completed", "cancelled"].includes(order.status) && <CancelOrderButton order={order} />}</div></article>)}</div>{!orders.length && <div className="empty-state"><ReceiptText size={28} /><p>{filter === "active" ? "Nenhum pedido em andamento." : "Nenhum pedido nesta categoria."}</p></div>}</>;
}
