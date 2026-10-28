"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/shared/blocos";
import { type StaffRole, useRestaurant } from "@/lib/restaurant-store";

export function destinationForRole(role: StaffRole) {
  if (role === "waiter") return "/operacao/garcom";
  if (role === "kitchen") return "/operacao/cozinha";
  if (role === "cashier") return "/operacao/caixa";
  if (role === "delivery") return "/operacao/entregas";
  return "/gestao/dashboard";
}

function LoginBackLink() {
  return <Link href="/" className="login-back" onClick={() => sessionStorage.removeItem("restaurante-return-to")}><ArrowLeft size={18} aria-hidden="true" />Voltar ao início</Link>;
}

export function StaffGate({ children, roles }: { children: React.ReactNode; roles?: StaffRole[] }) {
  const router = useRouter(); const { authenticated, ready, session, logout } = useRestaurant();
  if (!ready) return <main className="app-page min-h-screen" aria-busy="true" />;
  if (authenticated && session && (!roles || session.role === "admin" || roles.includes(session.role))) return <>{children}</>;
  if (authenticated && session) return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Área não liberada</h2><p className="mt-2">{session.username} está em {session.role === "waiter" ? "Garçom" : session.role === "kitchen" ? "Cozinha" : session.role === "cashier" ? "Caixa" : session.role === "delivery" ? "Entrega" : "Gestão"}. Escolha a área correta ou troque o usuário.</p><Link href={destinationForRole(session.role)} className="primary-button mt-6 justify-center">Ir para minha área <ArrowRight size={18} /></Link><button onClick={() => { void logout().then(() => router.push("/gestao")); }} className="secondary-button mt-3">Trocar usuário</button></div></section></main>;
  return <main className="login-page"><section className="login-form-wrap"><div className="login-card text-center"><LoginBackLink /><div className="login-lock mx-auto"><LockKeyhole size={22} /></div><h2>Confirme seu acesso</h2><p className="mt-2">Você selecionou esta área. Entre para continuar no papel escolhido.</p><Link href="/gestao" onClick={() => sessionStorage.setItem("restaurante-return-to", window.location.pathname)} className="primary-button mt-6 justify-center">Entrar <ArrowRight size={18} /></Link></div></section></main>;
}

export function ServerLogin() {
  const router = useRouter();
  const { login } = useRestaurant();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [busy, setBusy] = useState(false);
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
  return <main className="login-page"><section className="login-brand"><Brand dark /><div><span className="live-pill"><Sparkles size={13} /> Operação conectada</span><h1>Uma fila.<br />Uma operação.</h1><p>Pedidos, cozinha e caixa trabalham sobre a mesma base em tempo real.</p></div></section><section className="login-form-wrap"><form onSubmit={submit} className="login-card"><LoginBackLink /><div className="login-lock"><LockKeyhole size={22} /></div><h2>{owner ? "Entrar na Gestão" : "Iniciar turno"}</h2><p>{owner ? "Acesse como responsável para configurar o restaurante e a equipe." : "Digite seu nome como o responsável cadastrou e o seu PIN"}</p><div className="mb-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("owner")} className={owner ? "category-chip active" : "category-chip"}>Responsável</button><button type="button" onClick={() => setMode("staff")} className={!owner ? "category-chip active" : "category-chip"}>Equipe</button></div><label><span>{owner ? "Usuário administrador" : "Nome"}</span><input value={user} onChange={event => setUser(event.target.value)} autoComplete="username" autoCapitalize={owner ? "none" : "words"} placeholder={owner ? "Seu usuário" : "Seu nome"} required /></label><label><span>{owner ? "Senha" : "PIN"}</span><input value={password} onChange={event => setPassword(owner ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode={owner ? "text" : "numeric"} type="password" autoComplete="current-password" placeholder={owner ? "Sua senha" : "4 a 6 números"} required /></label><button className="primary-button w-full justify-center" type="submit" disabled={busy}>{busy ? "Entrando…" : owner ? "Entrar na gestão" : "Entrar no turno"} <ArrowRight size={18} /></button><p className="mt-4 text-center text-xs text-neutral-400">{owner ? "Use o usuário e a senha administrativos configurados no deploy." : "O PIN é criado pelo responsável ao cadastrar cada pessoa da equipe."}</p></form></section></main>;
}
