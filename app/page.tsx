import { restaurantContext } from "@/modules/tenancy/context";
import { getPublicMenu } from "@/lib/restaurant-repository";

import { AccessHub } from "@/components/access-hub";
import { Bike, ChefHat, CircleDollarSign, LayoutDashboard, UtensilsCrossed } from "lucide-react";

const areas = [
  { href: "/operacao/garcom", label: "Garçom", note: "Mesas e comandas", icon: UtensilsCrossed, tone: "lime" },
  { href: "/operacao/cozinha", label: "Cozinha", note: "Fila de produção", icon: ChefHat, tone: "amber" },
  { href: "/operacao/caixa", label: "Caixa", note: "Contas e pagamentos", icon: CircleDollarSign, tone: "blue" },
  { href: "/operacao/entregas", label: "Entregas", note: "Rotas e pedidos prontos", icon: Bike, tone: "amber" },
  { href: "/gestao", label: "Gestão", note: "Indicadores e controle", icon: LayoutDashboard, tone: "violet" },
];

export default async function Home() {
  const current=await restaurantContext();
  const {branding}=await getPublicMenu();
  return <AccessHub name={current.name} logoUrl={branding.logoUrl} areas={areas} />;
}
