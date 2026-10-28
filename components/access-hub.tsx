import Image from "next/image";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Vazio } from "@/components/shared/estados";

type AccessArea = { href: string; label: string; note: string; icon: LucideIcon };

export function AccessHub({ name, logoUrl, areas, username, actions }: {
  name: string;
  logoUrl?: string | null;
  areas: AccessArea[];
  username?: string;
  actions?: ReactNode;
}) {
  return (
    <main className="access-hub">
      <div className="access-hub-shell">
        <header className="access-hub-header">
          <div className="access-hub-brand">
            <Image src={logoUrl || "/restio-mark.svg"} alt={`Logo de ${name}`} width={48} height={48} unoptimized priority />
            <div><p>{name}</p><span>Operação e gestão do restaurante</span></div>
          </div>
          <div className="access-hub-actions"><Link href="/menu" className="secondary-button">Abrir cardápio</Link>{actions}</div>
        </header>
        <section className="access-hub-content" aria-labelledby="access-hub-title">
          <div className="access-hub-intro">
            {username && <p className="access-hub-greeting">Olá, {username}.</p>}
            <h1 id="access-hub-title">Acesso da equipe</h1>
            <p>{username ? "Escolha uma das áreas disponíveis para o seu acesso." : "Escolha sua área e entre com seu usuário ou PIN para começar."}</p>
          </div>
          {!areas.length ? <Vazio titulo="Nenhuma área disponível" descricao="Peça ao responsável para conferir o seu acesso." /> : <nav className="access-hub-grid" aria-label="Áreas de trabalho">
            {areas.map(({ href, label, note, icon: Icon }) => (
              <Link key={href} href={href} className="access-hub-card">
                <span className="access-hub-icon"><Icon size={23} aria-hidden="true" /></span>
                <div><h2>{label}</h2><p>{note}</p></div>
                <ArrowRight size={18} className="access-hub-arrow" aria-hidden="true" />
              </Link>
            ))}
          </nav>}
        </section>
        <footer className="access-hub-footer"><span>Restrio</span><span>O acesso às áreas depende da sua permissão.</span></footer>
      </div>
    </main>
  );
}
