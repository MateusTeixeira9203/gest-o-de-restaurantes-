"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, LockKeyhole } from "lucide-react";
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
  const { login, state, branding } = useRestaurant();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; warning: boolean } | null>(null);
  const submitting = useRef(false);
  useEffect(() => { if (sessionStorage.getItem("restaurante-return-to")?.startsWith("/operacao")) requestAnimationFrame(() => setMode("staff")); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await login(user, password);
      if (!result.ok) {
        const warning = result.message.startsWith("Muitas tentativas.");
        const message = warning ? "Muitas tentativas. Espere alguns minutos e tente de novo." : mode === "staff" ? "Nome ou PIN inválido. Confira com o gerente." : "Usuário ou senha inválidos. Confira seus dados.";
        setError({ message, warning });
        return;
      }
      const requested = sessionStorage.getItem("restaurante-return-to");
      const destination = requested || destinationForRole(result.role ?? "admin");
      sessionStorage.removeItem("restaurante-return-to");
      router.push(destination);
    } catch { setError({ message: "Não foi possível entrar. Confira a conexão e tente novamente.", warning: false }); }
    finally { submitting.current = false; setBusy(false); }
  };
  const owner = mode === "owner";
  return <main className="login-page login-preparo"><section className="login-form-wrap"><form onSubmit={submit} className="login-card" aria-busy={busy}>
    <LoginBackLink />
    <div className="login-restaurant"><Image src={branding.logoUrl || "/restio-mark.svg"} alt={`Logo de ${state.settings.name}`} width={56} height={56} unoptimized={Boolean(branding.logoUrl)} priority /><p>{state.settings.name}</p></div>
    <h1>{owner ? "Entrar na gestão" : "Iniciar turno"}</h1>
    <p>{owner ? "Acesse como responsável para cuidar do restaurante." : "Digite seu nome como o responsável cadastrou e o seu PIN."}</p>
    <div className="login-modes" role="group" aria-label="Tipo de acesso">{(["owner", "staff"] as const).map(value => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); setPassword(""); setError(null); }}>{value === "owner" ? "Responsável" : "Equipe"}</button>)}</div>
    <label><span>{owner ? "Usuário administrador" : "Nome"}</span><input value={user} onChange={event => setUser(event.target.value)} disabled={busy} autoComplete="username" autoCapitalize={owner ? "none" : "words"} placeholder={owner ? "Seu usuário" : "Seu nome"} required /></label>
    <label><span>{owner ? "Senha" : "PIN"}</span><input value={password} onChange={event => setPassword(owner ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} inputMode={owner ? "text" : "numeric"} type="password" autoComplete="current-password" placeholder={owner ? "Sua senha" : "4 a 6 números"} required /></label>
    {error && <div className={`login-feedback ${error.warning ? "login-feedback-warn" : "login-feedback-error"}`} role="alert"><CircleAlert size={20} aria-hidden="true" /><p>{error.message}</p></div>}
    <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}<ArrowRight size={18} aria-hidden="true" /></button>
    <p className="login-help">{owner ? "Use o usuário e a senha administrativos configurados no deploy." : "O PIN é criado pelo responsável ao cadastrar cada pessoa da equipe."}</p>
  </form></section></main>;
}
