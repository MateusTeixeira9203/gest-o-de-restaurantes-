"use client";

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import {orderCode} from '@/lib/domain';
import {useRestaurant} from '@/lib/restaurant-store';

type Ticket = ReturnType<typeof useRestaurant>['kitchen'][number] & {confirmedAt?: string | null};
const channels = {dine_in: 'Mesa', pickup: 'Balcão', delivery: 'Entrega'};
const readyText = {dine_in: 'Aguardando o garçom levar à mesa', pickup: 'Aguardando retirada no balcão', delivery: 'Aguardando o entregador'};
const columns = [{status: 'new', label: 'Na fila'}, {status: 'preparing', label: 'Em preparo'}, {status: 'ready', label: 'Prontos para entregar'}] as const;

function ticketTime(ticket: Ticket, now: number) {
  const confirmed = typeof ticket.confirmedAt === 'string' ? Date.parse(ticket.confirmedAt) : NaN;
  if (!now || !Number.isFinite(confirmed)) return {minutes: null, level: 0};
  const elapsed = Math.max(0, (now - confirmed) / 60000);
  const estimate = ticket.estimatedMinutes && ticket.estimatedMinutes > 0 ? ticket.estimatedMinutes : null;
  const redAfter = estimate ? estimate * 1.5 : 20;
  const level = elapsed > redAfter ? 2 : estimate && elapsed > estimate ? 1 : 0;
  return {minutes: Math.floor(elapsed), level: ticket.status === 'ready' ? 0 : level};
}

function channelTickets(tickets: Ticket[], channel: string, now: number) {
  return tickets.filter(ticket => channel === 'all' || ticket.fulfillment === channel)
    .sort((a, b) => ticketTime(b, now).level - ticketTime(a, now).level || a.queueNumber - b.queueNumber);
}

function TicketCard({ticket, now, busy, advance}: {
  ticket: Ticket; now: number; busy: string | null;
  advance: (id: string, status: 'preparing' | 'ready') => Promise<void>;
}) {
  const time = ticketTime(ticket, now);
  return <article className={`kitchen-card kitchen-channel-${ticket.fulfillment}`}>
    <header className="kitchen-channel-band"><span>{channels[ticket.fulfillment]}</span><h3>{orderCode(ticket)}</h3></header>
    <div className="kitchen-card-body">
      <p className="kitchen-ticket-meta">{ticket.sector}{ticket.customerName && ticket.fulfillment !== 'dine_in' ? ` · ${ticket.customerName}` : ''}</p>
      <p className={`kitchen-elapsed kitchen-delay-${time.level}`}>{time.minutes === null ? 'Horário de confirmação não informado' : `${time.minutes} min desde a confirmação`}{time.level > 0 && <strong> · {time.level === 2 ? 'Muito atrasado' : 'Atrasado'}</strong>}</p>
      <div className="kitchen-items">{ticket.items.map((item, index) => <div key={index}>
        <p className="kitchen-item-name">{item.quantity}× {item.productName} · {item.variantName}</p>
        {item.addons.map(addon => <p key={addon.id}>+ {addon.name}</p>)}
        {item.note && <p className="kitchen-item-note">Observação: {item.note}</p>}
      </div>)}</div>
      {ticket.notes && <p className="kitchen-item-note">Pedido: {ticket.notes}</p>}
      {ticket.status === 'ready' ? <p className="kitchen-ready-message">{readyText[ticket.fulfillment]}</p> : <><button disabled={busy !== null} onClick={() => void advance(ticket.id, ticket.status === 'new' ? 'preparing' : 'ready')} className="dark-button kitchen-advance">{busy === ticket.id ? 'Salvando…' : ticket.status === 'new' ? 'Começar preparo' : 'Marcar pronto'}</button>{ticket.status === 'new' && <button disabled={busy !== null} onClick={() => void advance(ticket.id, 'ready')} className="secondary-button kitchen-advance">Já está pronto</button>}</>}
    </div>
  </article>;
}

export function KitchenBoard() {
  const {kitchen, ready, refresh, updateKitchenTicket} = useRestaurant();
  const [sector, setSector] = useState('Todos');
  const [channel, setChannel] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function poll() {
      setNow(Date.now());
      const ok = await refresh().catch(() => false);
      if (active) {setError(ok ? '' : 'Não foi possível atualizar a fila. Confira a conexão e tente novamente.'); setLoading(false);}
    }
    void poll();
    const timer = setInterval(() => void poll(), 30000);
    return () => {active = false; clearInterval(timer);};
  }, [refresh]);
  const sectors = Array.from(new Set(['Cozinha', 'Pizzaria', 'Sobremesas', ...kitchen.map(ticket => ticket.sector)]));
  const sectorTickets = kitchen.filter(ticket => ticket.status !== 'cancelled' && (sector === 'Todos' || ticket.sector === sector));
  const tickets = channelTickets(sectorTickets, channel, now);
  async function advance(id: string, status: 'preparing' | 'ready') {
    setBusy(id);
    try {
      const result = await updateKitchenTicket(id, status);
      if (!result.ok) throw new Error(result.message);
      toast.success(status === 'preparing' ? 'Preparo iniciado.' : 'Setor pronto. O atendimento será avisado quando todos os setores finalizarem.');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Confira a conexão e tente novamente.');}
    finally {setBusy(null);}
  }
  async function retry() {
    setLoading(true);
    const ok = await refresh().catch(() => false);
    setError(ok ? '' : 'Não foi possível atualizar a fila. Confira a conexão e tente novamente.');
    setLoading(false);
  }
  return <main className="kitchen-page"><div className="kitchen-shell">
    <header className="topbar"><div><h1>Cozinha</h1><p>Na fila → Em preparo → Prontos para entregar</p></div><Link className="secondary-button" href="/operacao">Voltar</Link></header>
    <div className="sector-tabs" role="group" aria-label="Filtrar por setor">{['Todos', ...sectors].map(value => <button key={value} aria-pressed={sector === value} className={sector === value ? 'active' : ''} onClick={() => setSector(value)}>{value}</button>)}</div>
    <div className="kitchen-channel-filters" role="group" aria-label="Filtrar por canal"><button aria-pressed={channel === 'all'} onClick={() => setChannel('all')}>Todos os canais · {sectorTickets.length}</button>{Object.entries(channels).map(([value, label]) => <button className={`kitchen-channel-${value}`} key={value} aria-pressed={channel === value} onClick={() => setChannel(value)}>{label} · {sectorTickets.filter(ticket => ticket.fulfillment === value).length}</button>)}</div>
    {error && <div className="kitchen-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={loading} onClick={() => void retry()}>{loading ? 'Atualizando…' : 'Tentar novamente'}</button></div>}
    {(!ready || loading) && <p className="kitchen-load-state" role="status">Atualizando fila da cozinha…</p>}
    <div className="kanban" aria-busy={!ready || loading}>{columns.map(column => <section className="kanban-column" key={column.status} aria-label={column.label}>
      <h2 className="kanban-title"><span>{column.label}</span><b>{tickets.filter(ticket => ticket.status === column.status).length}</b></h2>
      <div className="kitchen-ticket-list">{tickets.filter(ticket => ticket.status === column.status).map(ticket => <TicketCard key={ticket.id} ticket={ticket} now={now} busy={busy} advance={advance}/>)}
        {ready && !loading && !error && !tickets.some(ticket => ticket.status === column.status) && <p className="kanban-empty">Nenhum pedido nesta etapa. {column.status === 'new' ? 'Os pedidos confirmados aparecem aqui; confira os filtros.' : 'Acompanhe os pedidos na etapa anterior.'}</p>}
      </div>
    </section>)}</div>
  </div></main>;
}
