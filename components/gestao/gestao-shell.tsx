"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Boxes, FileBarChart, LayoutDashboard, LogOut, Menu as MenuIcon, ReceiptText, Settings, Table2, UsersRound, WalletCards, X } from "lucide-react";
import { Brand } from "@/components/shared/blocos";
import { useRestaurant } from "@/lib/restaurant-store";
import { ManagementSection } from "@/components/gestao/gestao-secoes";

const managementNav = [
  ["dashboard", "Dashboard", LayoutDashboard], ["mesas", "Mesas", Table2], ["pedidos", "Pedidos", ReceiptText], ["cardapio", "Cardápio", MenuIcon], ["estoque", "Estoque", Boxes], ["financeiro", "Financeiro", WalletCards], ["fiscal", "Fiscal", ReceiptText], ["equipe", "Equipe", UsersRound], ["relatorios", "Relatórios", FileBarChart], ["configuracoes", "Configurações", Settings],
] as const;

const subscribeCompactMenu = (notify: () => void) => {
  const media = window.matchMedia("(max-width: 1024px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
export function Management({ section }: { section: string }) {
  const router = useRouter(); const [mobileNav, setMobileNav] = useState(false); const pageRef = useRef<HTMLDivElement>(null); const { logout, session, plan } = useRestaurant();
  const [collapsed, setCollapsed] = useState(false);
  const compact = useSyncExternalStore(subscribeCompactMenu, () => window.matchMedia("(max-width: 1024px)").matches, () => false);
  const navOpen = compact ? mobileNav : !collapsed;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeNav = () => { setMobileNav(false); setCollapsed(true); toggleRef.current?.focus(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { setMobileNav(false); setCollapsed(true); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const activeSection = section === "caixa" ? "financeiro" : section === "configuracoes-fiscal" ? "configuracoes" : section;
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = pageRef.current?.animate(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    return () => animation?.cancel();
  }, [section]);
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = `/gestao/${id}`;
    if (window.location.pathname !== destination) window.history.pushState(null, "", destination);
    setMobileNav(false);
  };
  const signOut = () => { void logout().then(() => router.push("/gestao")); };
  return <main className={`management${navOpen ? " nav-open" : " nav-closed"}`}>
    <aside id="management-navigation" inert={!navOpen} className={`manage-sidebar${navOpen ? " open" : ""}${mobileNav ? " mobile-open" : ""}`}>
      <div className="sidebar-brand"><Brand dark /><button className="icon-button" onClick={closeNav} aria-label="Fechar menu lateral"><X size={19} /></button></div>
      <nav aria-label="Áreas da gestão">{managementNav.filter(([id]) => plan === 'professional' || id !== 'fiscal').map(([id, label, Icon]) => <a key={id} href={`/gestao/${id}`} onClick={event => navigate(event, id)} aria-current={activeSection === id ? "page" : undefined} className={activeSection === id ? "active" : ""}><Icon size={18} /><span>{label}</span></a>)}</nav>
      <button onClick={signOut} className="logout-button"><LogOut size={17} /> Trocar usuário</button>
    </aside>
    {compact && <button className={`sidebar-overlay${navOpen ? " open" : ""}`} onClick={closeNav} aria-label="Fechar menu" aria-hidden={!navOpen} tabIndex={-1} disabled={!navOpen} />}
    <div className="manage-content"><header className="manage-top">
      <button ref={toggleRef} onClick={() => compact ? setMobileNav(value => !value) : setCollapsed(value => !value)} className="icon-button" aria-label={navOpen ? "Recolher menu" : "Abrir menu"} aria-expanded={navOpen} aria-controls="management-navigation"><MenuIcon size={19} /></button>
      <div className="manage-heading"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Gestão</p><h1 key={section} className="manage-title text-xl font-semibold capitalize">{managementNav.find(([id]) => id === activeSection)?.[1] ?? section}</h1></div>
      <div className="flex items-center gap-3"><span className="hidden text-sm text-neutral-500 sm:block">{session?.username ?? "Gestão"}</span><div className="avatar">{(session?.username ?? "AD").slice(0, 2).toUpperCase()}</div></div>
    </header><div className="manage-page" ref={pageRef}><ManagementSection section={section} /></div></div>
  </main>;
}



