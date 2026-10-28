"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Plus, SearchX } from "lucide-react";
import { useRestaurant } from "@/lib/restaurant-store";
import type { OrderStatus, TableStatus } from "@/lib/domain";
import type { TomEstado } from "@/components/shared/selos";

const TABLE_STATUS: Record<TableStatus, { label: string; cls: string }> = {
  available: { label: "Livre", cls: "status-free" }, occupied: { label: "Ocupada", cls: "status-occupied" }, preparing: { label: "Preparando", cls: "status-preparing" }, ready: { label: "Pedido pronto", cls: "status-ready" }, closing: { label: "Aguardando conta", cls: "status-closing" },
};
const ORDER_STATUS: Record<OrderStatus, string> = { pending: "Pendente", confirmed: "Na fila", preparing: "Em preparo", ready: "Pronto para entregar", out_for_delivery: "Em entrega", delivered: "Entregue", completed: "Concluído", cancelled: "Cancelado" };
const TABLE_TONE: Record<TableStatus, TomEstado> = { available: "ok", occupied: "neutral", preparing: "warn", ready: "ok", closing: "bill" };
const ORDER_TONE: Record<OrderStatus, TomEstado> = { pending: "warn", confirmed: "info", preparing: "warn", ready: "ok", out_for_delivery: "info", delivered: "ok", completed: "neutral", cancelled: "danger" };
export function Topbar({ title, subtitle, back = "/operacao", action }: { title: string; subtitle?: string; back?: string; action?: React.ReactNode }) {
  return <header className="topbar"><div className="flex min-w-0 items-center gap-3"><Link href={back} className="icon-button" aria-label="Voltar"><ArrowLeft size={19} /></Link><div className="min-w-0"><h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-0.5 truncate text-sm text-neutral-500">{subtitle}</p>}</div></div>{action}</header>;
}
export function StatusPill({ status }: { status: TableStatus }) { const meta = TABLE_STATUS[status]; return <span className={`status-pill ${meta.cls} selo selo-estado-${TABLE_TONE[status]}`}><span className="selo-ponto" aria-hidden="true" />{meta.label}</span>; }
export function OrderPill({ status }: { status: OrderStatus }) { return <span className={`order-pill order-${status} selo selo-estado-${ORDER_TONE[status]}`}><span className="selo-ponto" aria-hidden="true" />{ORDER_STATUS[status]}</span>; }
export function Elapsed({ date }: { date: string }) { const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(date)); return <span>{time}</span>; }
export function Brand({ dark = false, subtitle = "Operação & gestão" }: { dark?: boolean; subtitle?: string }) { const { state, branding } = useRestaurant(); return <div className="flex items-center gap-3"><span className="brand-mark"><Image src={branding.logoUrl || "/restio-mark.svg"} alt={`Logo de ${state.settings.name}`} width={112} height={112} priority unoptimized={Boolean(branding.logoUrl)} className="brand-logo" /></span><div><p className={`font-semibold tracking-tight ${dark ? "text-white" : "text-[var(--core-ink)]"}`}>{state.settings.name}</p><p className={`text-xs ${dark ? "text-white/40" : "text-[var(--core-muted)]"}`}>{subtitle}</p></div></div>; }
export function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon: React.ComponentType<{ size?: number }>; }) { return <article className="metric-card"><div className="metric-icon"><Icon size={18} /></div><p>{label}</p><strong>{value}</strong>{note && <span>{note}</span>}</article>; }
export function PageTitle({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && onAction && <button onClick={onAction} className="primary-button"><Plus size={17} /> {action}</button>}</div>; }
export function NotFound() { return <main className="app-page grid min-h-screen place-items-center"><div className="text-center"><SearchX size={32} className="mx-auto text-[var(--core-muted)]" aria-hidden="true" /><p className="mt-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">404</p><h1 className="mt-2 text-3xl font-semibold">Página não encontrada</h1><Link href="/operacao" className="primary-button mt-6">Voltar à operação</Link></div></main>; }
