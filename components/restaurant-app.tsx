"use client";
import { Management } from "@/components/gestao/gestao-shell";
import { Cashier } from "@/components/caixa/caixa";
import { Deliveries } from "@/components/entregas";
import { WaiterTables } from "@/components/salao/mesas";
import { TableCommand } from "@/components/salao/comanda";
import { MenuBuilder } from "@/components/cardapio/cardapio";

import { Topbar, Brand, NotFound } from "@/components/shared/blocos";
import { AccessHub } from "./access-hub";
import { FiscalWorkspace } from "./fiscal-workspace";





import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Bike, ChefHat, CircleDollarSign, LayoutDashboard, LockKeyhole, Sparkles, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { RestaurantStoreProvider, type StaffRole, useRestaurant } from "@/lib/restaurant-store";





import { KitchenBoard } from "@/components/kitchen-board";






function OperationHome() {
  const { session, logout, state, branding } = useRestaurant();
  const areas = [
    { href: "/operacao/garcom", role: "waiter", label: "Garçom", note: "Mesas e comandas", icon: UtensilsCrossed, tone: "lime" },
    { href: "/operacao/cozinha", role: "kitchen", label: "Cozinha", note: "Fila de produção", icon: ChefHat, tone: "amber" },
    { href: "/operacao/caixa", role: "cashier", label: "Caixa", note: "Contas e pagamentos", icon: CircleDollarSign, tone: "blue" },
    { href: "/operacao/entregas", role: "delivery", label: "Entregas", note: "Rotas e pedidos prontos", icon: Bike, tone: "amber" },
    { href: "/gestao/dashboard", role: "manager", label: "Gestão", note: "Indicadores e controle", icon: LayoutDashboard, tone: "violet" },
  ];
  const visibleAreas = session?.role === "admin" || session?.role === "manager" ? areas : areas.filter(area => area.role === session?.role);
  return <AccessHub name={state.settings.name} logoUrl={branding.logoUrl} areas={visibleAreas} username={session?.username} actions={session ? <button onClick={() => void logout()} className="secondary-button">Trocar usuário</button> : undefined} />;
}






























function destinationForRole(role: StaffRole) {
  if (role === "waiter") return "/operacao/garcom";
  if (role === "kitchen") return "/operacao/cozinha";
  if (role === "cashier") return "/operacao/caixa";
  if (role === "delivery") return "/operacao/entregas";
  return "/gestao/dashboard";
}

function LoginBackLink() {
  return <Link href="/" className="login-back" onClick={() => sessionStorage.removeItem("restaurante-return-to")}><ArrowLeft size={18} aria-hidden="true" />Voltar ao início</Link>;
}

function StaffGate({ children, roles }: { children: React.ReactNode; roles?: StaffRole[] }) {
  const router = useRouter(); const { authenticated, ready, session, logout } = useRestaurant();
  if (!ready) return <main className="app-page min-h-screen" aria-busy="true" />;
  if (authenticated && session && (!roles || session.role === "admin" || roles.includes(session.role))) return <>{children}</>;
  if (authenticated && session) return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Área não liberada</h2><p className="mt-2">{session.username} está em {session.role === "waiter" ? "Garçom" : session.role === "kitchen" ? "Cozinha" : session.role === "cashier" ? "Caixa" : session.role === "delivery" ? "Entrega" : "Gestão"}. Escolha a área correta ou troque o usuário.</p><Link href={destinationForRole(session.role)} className="primary-button mt-6 justify-center">Ir para minha área <ArrowRight size={18} /></Link><button onClick={() => { void logout().then(() => router.push("/gestao")); }} className="secondary-button mt-3">Trocar usuário</button></div></section></main>;
  return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Confirme seu acesso</h2><p className="mt-2">Você selecionou esta área. Entre para continuar no papel escolhido.</p><Link href="/gestao" onClick={() => sessionStorage.setItem("restaurante-return-to", window.location.pathname)} className="primary-button mt-6 justify-center">Entrar <ArrowRight size={18} /></Link></div></section></main>;
}

function ServerLogin() {
  const router = useRouter();
  const { login } = useRestaurant();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/auth/team", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(body => setTeam((body as { team?: Array<{ id: string; name: string; role: string }> } | null)?.team ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (sessionStorage.getItem("restaurante-return-to")?.startsWith("/operacao")) requestAnimationFrame(() => setMode("staff")); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    const result = await login(user, password);
    setBusy(false);
    if (!result.ok) { toast.error(result.message); return; }
    const requested = sessionStorage.getItem("restaurante-return-to");
    const destination = requested || destinationForRole(result.role ?? "admin");
    sessionStorage.removeItem("restaurante-return-to");
    router.push(destination);
  };
  const owner = mode === "owner";
  return <main className="login-page"><section className="login-brand"><Brand dark /><div><span className="live-pill"><Sparkles size={13} /> Operação conectada</span><h1>Uma fila.<br />Uma operação.</h1><p>Pedidos, cozinha e caixa trabalham sobre a mesma base em tempo real.</p></div></section><section className="login-form-wrap"><form onSubmit={submit} className="login-card"><LoginBackLink /><div className="login-lock"><LockKeyhole size={22} /></div><h2>{owner ? "Entrar na Gestão" : "Iniciar turno"}</h2><p>{owner ? "Acesse como responsável para configurar o restaurante e a equipe." : "Escolha seu nome e informe o PIN. O acesso fica aberto até trocar o usuário."}</p><div className="mb-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("owner")} className={owner ? "category-chip active" : "category-chip"}>Responsável</button><button type="button" onClick={() => setMode("staff")} className={!owner ? "category-chip active" : "category-chip"}>Equipe</button></div>{!owner && team.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{team.map(member => <button type="button" key={member.id} onClick={() => setUser(member.name)} className={user === member.name ? "category-chip active" : "category-chip"}>{member.name}</button>)}</div>}<label><span>{owner ? "Usuário administrador" : "Nome"}</span><input value={user} onChange={event => setUser(event.target.value)} autoComplete="username" placeholder={owner ? "Seu usuário" : "Seu nome"} required /></label><label><span>{owner ? "Senha" : "PIN"}</span><input value={password} onChange={event => setPassword(owner ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode={owner ? "text" : "numeric"} type="password" autoComplete="current-password" placeholder={owner ? "Sua senha" : "4 a 6 números"} required /></label><button className="primary-button w-full justify-center" type="submit" disabled={busy}>{busy ? "Entrando…" : owner ? "Entrar na gestão" : "Entrar no turno"} <ArrowRight size={18} /></button><p className="mt-4 text-center text-xs text-neutral-400">{owner ? "Use o usuário e a senha administrativos configurados no deploy." : "O PIN é criado pelo responsável ao cadastrar cada pessoa da equipe."}</p></form></section></main>;
}

function AppRouter() {
  const pathname = usePathname(); const { createOrder } = useRestaurant();
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "create_table_order",
      title: "Criar pedido de mesa",
      description: "Confirma um pedido real para uma mesa e envia à cozinha, usando IDs de produto e variante do cardápio.",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" }, variantId: { type: "string" }, quantity: { type: "number", minimum: 1 } },
              required: ["productId", "variantId", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: ["tableId", "items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { tableId: string; items: { productId: string; variantId: string; quantity: number }[] };
        if (!value?.tableId || !Array.isArray(value.items) || !value.items.length) throw new Error("Mesa e itens são obrigatórios");
        const result = await createOrder(value.tableId, value.items.map((i, index) => ({ ...i, key: `tool-${index}`, addonIds: [] })), "waiter");
        if (!result.ok) throw new Error(result.message);
        return { orderNumber: result.number, status: "confirmed", tableId: value.tableId };
      },
    };
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* unsupported context */ }
    return () => lifecycle.abort();
  }, [createOrder]);
  if (pathname === "/operacao") return <StaffGate><OperationHome /></StaffGate>;
  if (pathname === "/operacao/garcom") return <StaffGate roles={["waiter", "cashier", "manager"]}><WaiterTables /></StaffGate>;
  if (pathname.startsWith("/operacao/garcom/mesa/")) return <StaffGate roles={["waiter", "cashier", "manager"]}><TableCommand tableId={String(Number(pathname.split("/").pop())).padStart(2, "0")} /></StaffGate>;
  if (pathname === "/operacao/cozinha") return <StaffGate roles={["kitchen", "manager"]}><KitchenBoard /></StaffGate>;
  if (pathname === "/operacao/fiscal") return <StaffGate roles={["cashier", "manager"]}><main className="app-page"><div className="page-container"><Topbar title="Fiscal" back="/operacao/caixa" /><FiscalWorkspace /></div></main></StaffGate>;
  if (pathname === "/operacao/caixa") return <StaffGate roles={["cashier", "manager"]}><Cashier /></StaffGate>;
  if (pathname === "/operacao/entregas") return <StaffGate roles={["delivery", "cashier", "manager"]}><Deliveries /></StaffGate>;
  if (pathname === "/menu") return <MenuBuilder source="qr" publicMenu />;
  if (pathname === "/menu/entrega") return <MenuBuilder key="delivery-menu" source="qr" publicMenu deliveryLink />;
  if (pathname.startsWith("/menu/mesa/")) return <MenuBuilder source="qr" publicMenu tableId={pathname.split("/").pop()!} />;
  if (pathname === "/gestao") return <ServerLogin />;
  if (pathname === "/gestao/configuracoes/fiscal") return <StaffGate roles={["manager"]}><Management section="configuracoes-fiscal" /></StaffGate>;
  if (pathname.startsWith("/gestao/")) return <StaffGate roles={["manager"]}><Management section={pathname.split("/").pop() || "dashboard"} /></StaffGate>;
  return <NotFound />;
}

export default function RestaurantApp() {
  const [mounted, setMounted] = useState(false);
  // The local demo store is browser-only; wait for hydration before rendering it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="app-page min-h-screen" aria-busy="true" />;
  return <RestaurantStoreProvider><AppRouter /><Toaster position="top-center" richColors /></RestaurantStoreProvider>;
}
