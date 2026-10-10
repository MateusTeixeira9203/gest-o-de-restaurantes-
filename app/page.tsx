import { restaurantContext } from "@/modules/tenancy/context";
import { getPublicMenu } from "@/lib/restaurant-repository";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bike, ChefHat, CircleDollarSign, LayoutDashboard, UtensilsCrossed } from "lucide-react";

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
  return (
    <main className="min-h-screen bg-[#16120e] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col rounded-[2rem] border border-white/10 bg-[#1b1712] p-6 shadow-2xl shadow-black/30 sm:p-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-[#ffbc1b]/40 bg-black/40 p-0.5">
              <Image src={branding.logoUrl||"/comanda-inteligente-mark.svg"} alt={current.name} unoptimized width={96} height={96} priority className="h-full w-full object-contain" />
            </span>
            <div><p className="text-lg font-semibold tracking-tight">{current.name}</p><p className="text-xs text-white/45">Operação & gestão</p></div>
          </div>
          <Link href="/menu" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white">Abrir cardápio</Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12 sm:py-16">
          <div className="mb-10 max-w-xl">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffbd1a]/30 bg-[#ffbd1a]/10 px-3 py-1.5 text-xs font-semibold text-[#ffcc4d]"><span className="h-1.5 w-1.5 rounded-full bg-[#ffb20a]" /> Acesso da equipe</span>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">Onde você vai trabalhar agora?</h1>
            <p className="mt-4 text-base leading-relaxed text-white/50 sm:text-lg">Escolha uma área para entrar. Garçom, cozinha, caixa e entrega têm acesso direto.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {areas.map(({ href, label, note, icon: Icon, tone }) => (
              <Link key={href} href={href} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]">
                <div className={`icon-tile icon-${tone}`}><Icon size={20} /></div>
                <div className="mt-8 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{label}</h2><p className="mt-1 text-sm text-white/45">{note}</p></div><ArrowRight className="text-white/30 transition group-hover:translate-x-1 group-hover:text-white" size={19} /></div>
              </Link>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-white/35"><span>Selecione seu papel para começar</span><span>Operação compartilhada em tempo real</span></footer>
      </div>
    </main>
  );
}
