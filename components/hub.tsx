"use client";

import { Bike, ChefHat, CircleDollarSign, LayoutDashboard, UtensilsCrossed } from "lucide-react";
import { AccessHub } from "@/components/access-hub";
import { useRestaurant } from "@/lib/restaurant-store";
import { Carregando } from "@/components/shared/estados";

export function OperationHome() {
  const { session, logout, state, branding, ready } = useRestaurant();
  if (!ready) return <main className="access-hub"><Carregando mensagem="Carregando suas áreas…" /></main>;
  const areas = [
    { href: "/operacao/garcom", role: "waiter", label: "Salão", note: "Mesas e comandas", icon: UtensilsCrossed },
    { href: "/operacao/cozinha", role: "kitchen", label: "Cozinha", note: "Fila de produção", icon: ChefHat },
    { href: "/operacao/caixa", role: "cashier", label: "Caixa", note: "Contas e pagamentos", icon: CircleDollarSign },
    { href: "/operacao/entregas", role: "delivery", label: "Entregas", note: "Rotas e pedidos prontos", icon: Bike },
    { href: "/gestao/dashboard", role: "manager", label: "Gestão", note: "Indicadores e controle", icon: LayoutDashboard },
  ];
  const visibleAreas = session?.role === "admin" || session?.role === "manager" ? areas : areas.filter(area => area.role === session?.role);
  return <AccessHub name={state.settings.name} logoUrl={branding.logoUrl} areas={visibleAreas} username={session?.username} actions={session ? <button onClick={() => void logout()} className="secondary-button">Trocar usuário</button> : undefined} />;
}
