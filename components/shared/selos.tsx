import { dadosCanal, dadosEstado, type PedidoCanal, type TomEstado } from "./selos-dados";
export type { TomEstado } from "./selos-dados";

export function SeloCanal({ pedido }: { pedido: PedidoCanal }) {
  const canal = dadosCanal(pedido);
  return <span className={`selo ${canal.classe}`}>
    {pedido.fulfillment !== "dine_in" && <><span>{canal.rotulo}</span><span aria-hidden="true">·</span></>}<span>{canal.codigo}</span>
  </span>;
}

export function SeloEstado({ texto, tom = "neutral" }: { texto: string; tom?: TomEstado }) {
  return <span className={`selo ${dadosEstado(tom).classe}`}><span className="selo-ponto" aria-hidden="true" /><span>{texto}</span></span>;
}
