"use client";

import type { ReactNode } from "react";
import { CircleAlert, Inbox, type LucideIcon } from "lucide-react";

type CarregandoProps = {
  formato?: "cartoes" | "lista" | "painel";
  quantidade?: number;
  mensagem?: string;
};

export function Carregando({ formato = "cartoes", quantidade = 3, mensagem = "Carregando…" }: CarregandoProps) {
  return <section className={`estado-carregando estado-carregando-${formato}`} role="status" aria-busy="true" aria-label={mensagem}>
    <span className="sr-only">{mensagem}</span>
    {Array.from({ length: quantidade }, (_, index) => <div className="esqueleto-cartao" aria-hidden="true" key={index}>
      <div className="esqueleto esqueleto-titulo" />
      <div className="esqueleto esqueleto-linha" />
      {formato !== "lista" && <div className="esqueleto esqueleto-linha esqueleto-curto" />}
    </div>)}
  </section>;
}

type VazioProps = {
  titulo: string;
  descricao: string;
  icone?: LucideIcon;
  acao?: ReactNode;
};

export function Vazio({ titulo, descricao, icone: Icone = Inbox, acao }: VazioProps) {
  return <section className="estado-vazio">
    <Icone size={28} aria-hidden="true" />
    <h2>{titulo}</h2>
    <p>{descricao}</p>
    {acao && <div className="estado-acoes">{acao}</div>}
  </section>;
}

type ErroLeituraProps = {
  mensagem: string;
  aoTentarNovamente: () => void;
  tentando?: boolean;
  semPerda?: boolean;
};

export function ErroLeitura({ mensagem, aoTentarNovamente, tentando = false, semPerda = false }: ErroLeituraProps) {
  return <section className="estado-erro" role="alert">
    <CircleAlert size={24} aria-hidden="true" />
    <div><h2>{mensagem}</h2>
      {semPerda && <p>Nada foi perdido.</p>}
      <p>Tente carregar novamente.</p>
      <button type="button" className="secondary-button" onClick={aoTentarNovamente} disabled={tentando}>
        {tentando ? "Tentando…" : "Tentar de novo"}
      </button>
    </div>
  </section>;
}
