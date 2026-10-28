import { orderCode } from "@/lib/domain";

export type PedidoCanal = Parameters<typeof orderCode>[0];
export const canais = {
  dine_in: { rotulo: "Mesa", classe: "mesa" },
  pickup: { rotulo: "Balcão", classe: "balcao" },
  delivery: { rotulo: "Entrega", classe: "entrega" },
} as const;

export function dadosCanal(pedido: PedidoCanal) {
  const canal = canais[pedido.fulfillment];
  return { rotulo: canal.rotulo, classe: `selo-canal-${canal.classe}`, codigo: orderCode(pedido) };
}

export const estados = {
  ok: "Concluído", warn: "Atenção", danger: "Erro", info: "Informação", neutral: "Não informado", bill: "Pediu a conta",
} as const;
export type TomEstado = keyof typeof estados;

export function dadosEstado(tom: TomEstado) {
  return { rotulo: estados[tom], classe: `selo-estado-${tom}` };
}
