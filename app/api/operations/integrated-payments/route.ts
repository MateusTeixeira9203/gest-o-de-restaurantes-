import { z } from 'zod';
import { sessionFromRequest } from '@/lib/staff-session';
import { requireProfessional } from '@/modules/tenancy/context';
import { applyConfirmedPayment,integratedPayments } from '@/modules/payments/settlement';
export async function GET(request:Request){
 const s=await sessionFromRequest(request);
 if(!s||!['admin','manager','cashier'].includes(s.role))return Response.json({error:'Acesso financeiro necessário.'},{status:403});
 try{await requireProfessional();return Response.json(await integratedPayments(s.restaurantId),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Pagamentos integrados indisponíveis.'},{status:400});}
}
export async function POST(request:Request){
 const s=await sessionFromRequest(request);
 if(!s||!['admin','manager','cashier'].includes(s.role))return Response.json({error:'Acesso financeiro necessário.'},{status:403});
 try{
  await requireProfessional();const {operationId}=z.object({operationId:z.string().uuid()}).strict().parse(await request.json());
  return Response.json(await applyConfirmedPayment(s.restaurantId,operationId,{role:s.role,name:s.username}));
 }catch(error){return Response.json({error:error instanceof z.ZodError?'Dados inválidos.':error instanceof Error?error.message:'Falha ao conferir recebimento.'},{status:400});}
}
