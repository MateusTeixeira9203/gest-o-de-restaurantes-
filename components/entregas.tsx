"use client";

import { useRef, useState } from "react";
import { Bike, Check, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/shared/blocos";
import { ExternalPaymentAction } from "@/components/external-payment";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, orderTotal, type Order } from "@/lib/domain";
import "@/app/styles/entregas.css";

const tabs = [
  { id: "ready", label: "Prontos", empty: "Nenhuma entrega pronta.", statuses: ["ready"] },
  { id: "preparing", label: "Em preparo", empty: "Nenhuma entrega em preparo.", statuses: ["confirmed", "preparing"] },
  { id: "route", label: "Em rota", empty: "Nenhuma entrega em rota.", statuses: ["out_for_delivery"] },
  { id: "delivered", label: "Entregues a receber", empty: "Nenhuma entrega aguardando pagamento.", statuses: ["delivered"] },
];

function DeliveryPayment({ order }: { order: Order }) {
  const remaining = Math.max(0, (order.totalCents ?? Math.round(orderTotal(order) * 100)) - (order.paidCents ?? 0));
  return <div className="delivery-payment">
    <p className={order.paid ? "delivery-paid" : "delivery-due"}>{order.paid ? "Pago" : `A receber ${money(remaining / 100)}`}</p>
    {!order.paid && <ExternalPaymentAction order={order} />}
  </div>;
}

function DeliveryAddress({ order }: { order: Order }) {
  if (!order.delivery) return <p className="delivery-private">Endereço visível só para o entregador</p>;
  const address = [order.delivery.addressLine1, order.delivery.neighborhood].filter(Boolean).join(", ");
  const phone = order.customerPhone?.replace(/[^+\d]/g, "");
  return <div className="delivery-address"><MapPin size={20} aria-hidden="true" />
    <div><p className="delivery-address-text">{address || "Endereço não informado"}</p>
      {order.delivery.reference && <p className="delivery-reference">Referência: {order.delivery.reference}</p>}
      <div className="delivery-links">
        {phone && /\d/.test(phone) && <a className="secondary-button" href={`tel:${phone}`}><Phone size={16} aria-hidden="true" />Ligar</a>}
        {address && <a className="secondary-button" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}>Abrir no mapa</a>}
      </div>
    </div>
  </div>;
}

export function Deliveries() {
  const { state, ready, refresh, updateDeliveryStatus } = useRestaurant();
  const [active, setActive] = useState("ready");
  const [busy, setBusy] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const pending = useRef(new Set<string>());
  const orders = state.orders.filter(order => order.fulfillment === "delivery" &&
    (["confirmed", "preparing", "ready", "out_for_delivery"].includes(order.status) || (order.status === "delivered" && !order.paid)))
    .sort((a, b) => a.number - b.number);
  const selected = tabs.find(tab => tab.id === active)!;
  const visible = orders.filter(order => selected.statuses.includes(order.status));
  const reload = async () => {
    setRefreshing(true);
    try { setLoadError(!await refresh()); }
    catch { setLoadError(true); }
    finally { setRefreshing(false); }
  };
  const update = async (order: Order, status: "out_for_delivery" | "delivered") => {
    if (pending.current.has(order.id)) return;
    pending.current.add(order.id);
    setBusy([...pending.current]);
    try {
      const result = await updateDeliveryStatus(order.id, status);
      if (result.ok) toast.success(status === "out_for_delivery" ? "Pedido saiu para entrega." : "Entrega concluída.");
      else toast.error(result.message);
    } catch { toast.error("Não foi possível atualizar a entrega. Tente novamente."); }
    finally { pending.current.delete(order.id); setBusy([...pending.current]); }
  };
  return <main className="app-page deliveries-page"><div className="page-container max-w-5xl">
    <Topbar title="Entregas" subtitle="Confira o endereço e o valor antes de sair." />
    {!ready ? <div className="empty-state" role="status"><p>Carregando entregas…</p><button className="secondary-button" disabled={refreshing} onClick={() => void reload()}>Tentar novamente</button></div> : <>
      <div className="delivery-tabs" role="group" aria-label="Filtrar entregas">{tabs.map(tab => <button key={tab.id} aria-pressed={active === tab.id} onClick={() => setActive(tab.id)}>
        {tab.label} <span>{orders.filter(order => tab.statuses.includes(order.status)).length}</span>
      </button>)}</div>
      <section className="delivery-grid" aria-label={selected.label}>{visible.map(order => <article key={order.id} className="command-card delivery-card">
        <header><div><span className="fulfillment-tag fulfillment-delivery">Entrega</span><h2>E-{order.number}</h2><p>{order.customerName || "Cliente"}</p></div>
          <span className="order-pill">{active === "delivered" ? "Entregue" : selected.label}</span></header>
        <DeliveryAddress order={order} />
        <div className="delivery-items">{order.items.map(item => <p key={item.id}>{item.quantity}× {item.productName} <span>· {item.variantName}</span></p>)}</div>
        <DeliveryPayment order={order} />
        {order.status === "ready" && <button disabled={busy.includes(order.id)} onClick={() => void update(order, "out_for_delivery")} className="primary-button delivery-action"><Bike size={18} />{busy.includes(order.id) ? "Salvando…" : "Saiu para entrega"}</button>}
        {order.status === "out_for_delivery" && <button disabled={busy.includes(order.id)} onClick={() => void update(order, "delivered")} className="primary-button delivery-action"><Check size={18} />{busy.includes(order.id) ? "Salvando…" : "Marcar entregue"}</button>}
      </article>)}{!visible.length && <div className="empty-state delivery-empty"><Bike size={28} /><p>{selected.empty}</p><p>As entregas aparecem aqui conforme avançam na operação.</p><button className="secondary-button" disabled={refreshing} onClick={() => void reload()}>{refreshing ? "Atualizando…" : "Atualizar entregas"}</button></div>}</section>
    </>}
    {loadError && <div role="alert" className="delivery-private"><p>Não foi possível carregar as entregas. Tente novamente.</p><button className="secondary-button" disabled={refreshing} onClick={() => void reload()}>Tentar novamente</button></div>}
  </div></main>;
}
