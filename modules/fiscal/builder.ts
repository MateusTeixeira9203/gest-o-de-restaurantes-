import type { Issuer, Tax } from "./schema.ts";
export type Sale={id:string;order_number:string;source:string;fulfillment:string;status:string;subtotal_cents:number;service_cents:number;delivery_fee_cents:number;total_cents:number};
export type SaleItem={id:string;order_id:string;product_id:string|null;product_name:string;variant_name:string;quantity:number;unit_price_cents:number;addons:Array<{priceCents?:number;price_cents?:number;price?:number;name?:string}>};
export type Receipt={order_id:string;method:string;amount_cents:number};
const decimal=(c:number)=>(c/100).toFixed(2);
export function buildFiscal(issuer:Issuer,sales:Sale[],items:SaleItem[],receipts:Receipt[],taxes:Record<string,Tax>) {
 const blockers:string[]=[];
 if(!issuer.cnpj||!issuer.legalName||!issuer.ie||!issuer.regime)blockers.push("Complete CNPJ, razão social, inscrição estadual e regime do emitente.");
 if(!issuer.reviewed||!issuer.accountant)blockers.push("O contador precisa validar o emitente e a tributação.");
 if(!issuer.presentialApproved)blockers.push("Valide a emissão NFC-e para atendimento presencial com o contador.");
 // This first mapper intentionally supports only reviewed, non-taxed Simples items.
 // Other regimes/codes need their own bases/rates and cannot be inferred from dish names.
 if(!["1","4"].includes(issuer.regime))blockers.push("O mapeamento atual cobre Simples Nacional; este regime precisa de mapeamento adicional.");
 const output=[];
 for(const sale of sales){
  if(!["completed","delivered"].includes(sale.status))blockers.push(`Pedido ${sale.order_number}: conclua o atendimento antes de preparar neste painel.`);
  if(sale.fulfillment!=="dine_in" || !["waiter","cashier"].includes(sale.source))blockers.push(`Pedido ${sale.order_number}: canal precisa de enquadramento fiscal próprio; não será transmitido como presencial.`);
  if(sale.service_cents||sale.delivery_fee_cents)blockers.push(`Pedido ${sale.order_number}: serviço/frete precisa de tratamento tributário validado.`);
  const lines=items.filter(i=>i.order_id===sale.id);
  let sum=0;
  if(!lines.length)blockers.push(`Pedido ${sale.order_number}: sem itens.`);
  for(const item of lines){
   const tax=item.product_id?taxes[item.product_id]:undefined;
   if(!tax?.reviewed||!tax.ncm||!tax.cfop||!tax.origin||!tax.icms||!tax.pis||!tax.cofins)blockers.push(`${item.product_name}: classificação fiscal incompleta ou não revisada.`);
   if(tax && (!['102','103','300','400'].includes(tax.icms)||!['04','06','07','08','09'].includes(tax.pis)||!['04','06','07','08','09'].includes(tax.cofins)||!tax.cfop.startsWith('5')))blockers.push(`${item.product_name}: código requer cálculo tributário adicional.`);
   if(item.addons?.length)blockers.push(`${item.product_name}: adicionais precisam de classificação fiscal própria.`);
   sum+=item.quantity*item.unit_price_cents;
   output.push({numero_item:output.length+1,codigo_produto:item.product_id||item.id,descricao:`${item.product_name} ${item.variant_name}`.slice(0,120),codigo_ncm:tax?.ncm||"",cfop:tax?.cfop||"",unidade_comercial:"UN",quantidade_comercial:item.quantity,valor_unitario_comercial:decimal(item.unit_price_cents),valor_bruto:decimal(item.unit_price_cents*item.quantity),unidade_tributavel:"UN",quantidade_tributavel:item.quantity,valor_unitario_tributavel:decimal(item.unit_price_cents),icms_origem:tax?.origin||"",icms_situacao_tributaria:tax?.icms||"",pis_situacao_tributaria:tax?.pis||"",cofins_situacao_tributaria:tax?.cofins||"",inclui_no_total:"1",...(tax?.cest?{cest:tax.cest}:{})});
  }
  if(sum!==sale.subtotal_cents||sum!==sale.total_cents)blockers.push(`Pedido ${sale.order_number}: total inclui ajustes não mapeados no fiscal.`);
  if(receipts.filter(p=>p.order_id===sale.id).reduce((n,p)=>n+p.amount_cents,0)!==sale.total_cents)blockers.push(`Pedido ${sale.order_number}: recebimentos não conferem com o total.`);
 }
 const methods:Record<string,string>={cash:"01",credit:"03",debit:"04",pix:"17"};
 if(receipts.some(p=>!methods[p.method]))blockers.push("Há pagamento sem mapeamento fiscal.");
 const totalCents=sales.reduce((n,s)=>n+s.total_cents,0);
 if(totalCents<=0)blockers.push("Total fiscal deve ser positivo.");
 const payload={cnpj_emitente:issuer.cnpj,natureza_operacao:"VENDA AO CONSUMIDOR",tipo_documento:"1",finalidade_emissao:"1",consumidor_final:"1",local_destino:"1",presenca_comprador:"1",indicador_inscricao_estadual_destinatario:"9",modalidade_frete:"9",items:output,formas_pagamento:receipts.map(p=>({forma_pagamento:methods[p.method]||"99",valor_pagamento:decimal(p.amount_cents),...(["credit","debit"].includes(p.method)?{tipo_integracao:"2"}:{})}))};
 return {payload,totalCents,blockers:[...new Set(blockers)],sales,items,receipts,issuer,taxes};
}
