import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, transaction } from '@/lib/database';
import { financeLock, postSalePayment } from '@/modules/finance/service';
import { authorize, type Actor, type Environment, type PaymentRequest } from '@/modules/integrations/contracts';
import { prepare } from '@/modules/integrations/queue';

const allocationsSchema=z.array(z.object({orderId:z.string().uuid(),amountCents:z.number().int().positive()})).min(1);
const requestSchema=z.object({amountCents:z.number().int().positive(),currency:z.literal('BRL'),method:z.enum(['pix','credit','debit']),channel:z.enum(['direct','terminal']),terminalId:z.string().optional()}).strict();

// Server adapter entry point only. Caller owns the transaction and authenticated tenant.
// It freezes the orders and shift BEFORE contacting the provider, never from webhook JSON.
export async function preparePaymentIntent(client:PoolClient,rid:string,tableNumber:number,request:PaymentRequest,provider:string,environment:Environment,key:string,actor:Actor){
 authorize('payment',actor);requestSchema.parse(request);
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payment-intent:${rid}:${key}`]);
 const prior=(await client.query('SELECT o.*,i.table_id FROM integration_operations o JOIN payment_intents i ON i.operation_id=o.id WHERE o.restaurant_id=$1 AND o.environment=$2 AND o.kind=\'payment\' AND o.operation_key=$3',[rid,environment,key])).rows[0];
 const table=(await client.query('SELECT id FROM dining_tables WHERE restaurant_id=$1 AND number=$2 FOR UPDATE',[rid,tableNumber])).rows[0];
 if(!table)throw new Error('Comanda não encontrada.');
 if(prior){
  if(prior.table_id!==table.id)throw new Error('Chave de cobrança já usada em outra comanda.');
  return prepare(client,{restaurantId:rid,environment,kind:'payment',provider,key,payload:{...request}},actor);
 }
 const outstanding=await client.query("SELECT 1 FROM payment_intents i JOIN integration_operations o ON o.id=i.operation_id AND o.restaurant_id=i.restaurant_id WHERE i.restaurant_id=$1 AND i.table_id=$2 AND o.environment=$3 AND i.state<>'applied' AND o.status NOT IN ('failed','cancelled') LIMIT 1",[rid,table.id,environment]);
 if(outstanding.rowCount)throw new Error('Já existe cobrança pendente nesta comanda. Consulte o resultado antes de iniciar outra.');
 const orders=(await client.query("SELECT o.id,o.status,o.total_cents-COALESCE((SELECT sum(p.amount_cents) FROM payments p WHERE p.order_id=o.id AND p.status='paid'),0) AS due FROM orders o WHERE o.restaurant_id=$1 AND o.table_id=$2 AND o.status NOT IN ('cancelled','completed') ORDER BY o.id FOR UPDATE",[rid,table.id])).rows;
 if(orders.some(o=>o.status==='pending'))throw new Error('Aprove os pedidos antes da cobrança.');
 if(orders.reduce((sum,o)=>sum+Number(o.due),0)<request.amountCents)throw new Error('Valor maior que o saldo da comanda.');
 await financeLock(client,rid);
 const shift=(await client.query('SELECT id FROM cash_shifts WHERE restaurant_id=$1 AND closed_at IS NULL FOR UPDATE',[rid])).rows[0];
 if(!shift)throw new Error('Abra o caixa antes de preparar a cobrança.');
 let remaining=request.amountCents;
 const allocations=orders.flatMap(o=>{const amountCents=Math.min(remaining,Math.max(0,Number(o.due)));remaining-=amountCents;return amountCents?[{orderId:o.id,amountCents}]:[];});
 const operation=await prepare(client,{restaurantId:rid,environment,kind:'payment',provider,key,payload:{...request}},actor);
 await client.query('INSERT INTO payment_intents(operation_id,restaurant_id,table_id,cash_shift_id,allocations) VALUES($1,$2,$3,$4,$5::jsonb)',[operation.id,rid,table.id,shift.id,JSON.stringify(allocations)]);
 return operation;
}

// No client-supplied paid flag, amount or external ID is accepted here.
// Production dispatch remains disabled until a concrete connector is homologated.
export async function applyConfirmedPayment(rid:string,id:string,actor:Actor){
 authorize('fiscal',actor); // same cashier/management boundary for financial recovery
 return transaction(async client=>{
  const hint=(await client.query('SELECT table_id FROM payment_intents WHERE restaurant_id=$1 AND operation_id=$2',[rid,id])).rows[0];
  if(!hint)throw new Error('Cobrança não encontrada.');
  await client.query('SELECT id FROM dining_tables WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',[hint.table_id,rid]);
  const row=(await client.query('SELECT i.*,o.kind,o.environment,o.provider,o.payload,o.result,o.status FROM payment_intents i JOIN integration_operations o ON o.id=i.operation_id AND o.restaurant_id=i.restaurant_id WHERE i.restaurant_id=$1 AND i.operation_id=$2 FOR UPDATE OF i,o',[rid,id])).rows[0];
  if(!row||row.kind!=='payment')throw new Error('Cobrança inválida.');
  if(row.state==='applied')return {state:'applied',replayed:true};
  if(row.environment!=='production')return {state:'homologation',message:'Simulação não movimenta o financeiro.'};
  if(row.status!=='succeeded'||row.result?.code!=='payment_confirmed'||typeof row.result?.externalId!=='string'||!row.result.externalId.trim())return {state:'awaiting'};
  const review=async(reason:string)=>{await client.query("UPDATE payment_intents SET state='review',reason=$3 WHERE restaurant_id=$1 AND operation_id=$2",[rid,id,reason]);return {state:'review',reason};};
  const parsed=requestSchema.safeParse(row.payload),allocation=allocationsSchema.safeParse(row.allocations);
  if(!parsed.success||!allocation.success)return review('Dados da cobrança inválidos.');
  const request=parsed.data,allocations=allocation.data;
  if(new Set(allocations.map(a=>a.orderId)).size!==allocations.length||allocations.reduce((sum,a)=>sum+a.amountCents,0)!==request.amountCents)return review('Rateio da cobrança divergente.');
  const orders=(await client.query("SELECT o.id,o.status,o.served_at,o.total_cents-COALESCE((SELECT sum(p.amount_cents) FROM payments p WHERE p.order_id=o.id AND p.status='paid'),0) AS due FROM orders o WHERE o.restaurant_id=$1 AND o.table_id=$2 AND o.id=ANY($3::uuid[]) ORDER BY o.id FOR UPDATE",[rid,row.table_id,allocations.map(a=>a.orderId)])).rows;
  if(orders.length!==allocations.length||allocations.some(a=>{const order=orders.find(o=>o.id===a.orderId);return !order||['pending','cancelled','completed'].includes(order.status)||Number(order.due)<a.amountCents;}))return review('A conta mudou ou já recebeu outro pagamento. Confira o provedor antes de estornar ou lançar.');
  await financeLock(client,rid);
  const shift=(await client.query('SELECT id FROM cash_shifts WHERE id=$1 AND restaurant_id=$2 AND closed_at IS NULL FOR UPDATE',[row.cash_shift_id,rid])).rows[0];
  if(!shift)return review('O caixa original foi fechado. Recebimento exige conferência da gestão.');
  const claim=await client.query('INSERT INTO payment_provider_receipts(restaurant_id,provider,external_id,operation_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING operation_id',[rid,row.provider,row.result.externalId,id]);
  if(!claim.rowCount)return review('A confirmação do provedor já foi vinculada a outra cobrança.');
  for(const a of allocations){
   const payment=(await client.query("INSERT INTO payments(order_id,method,amount_cents,status,paid_at,received_cents,change_cents) VALUES($1,$2,$3::integer,'paid',now(),$3::integer,0) RETURNING id",[a.orderId,request.method,a.amountCents])).rows[0];
   await postSalePayment(client,rid,payment.id,a.orderId,request.method,a.amountCents,actor);
   await client.query("INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'payment_confirmed',$2,$3::jsonb)",[a.orderId,actor.role,JSON.stringify({processedBy:actor.name,operationId:id,provider:row.provider,externalId:row.result.externalId})]);
  }
  await client.query("UPDATE orders SET status='completed',updated_at=now() WHERE restaurant_id=$1 AND id=ANY($2::uuid[]) AND served_at IS NOT NULL AND COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=orders.id AND status='paid'),0)>=total_cents",[rid,allocations.map(a=>a.orderId)]);
  await client.query("UPDATE payment_intents SET state='applied',reason=NULL,applied_at=now() WHERE restaurant_id=$1 AND operation_id=$2",[rid,id]);
  return {state:'applied',replayed:false};
 });
}
export async function integratedPayments(rid:string){
 const rows=await query('SELECT i.operation_id,i.state,i.reason,i.applied_at,o.environment,o.provider,o.status,o.created_at,o.payload->>\'amountCents\' AS amount_cents,o.payload->>\'method\' AS method FROM payment_intents i JOIN integration_operations o ON o.id=i.operation_id AND o.restaurant_id=i.restaurant_id WHERE i.restaurant_id=$1 ORDER BY o.created_at DESC LIMIT 100',[rid]);
 return {connectorEnabled:false,items:rows.rows};
}
