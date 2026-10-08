import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { refundAndCancel } from "@/modules/finance/refunds";
export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}){
 const s=await sessionFromRequest(request);if(!s||!['admin','manager'].includes(s.role))return Response.json({error:'Acesso de gestão necessário.'},{status:403});
 try{const input=z.object({reason:z.string().trim().min(5).max(300),confirmedReturned:z.literal(true)}).parse(await request.json());const id=z.string().uuid().parse((await params).orderId);return Response.json(await refundAndCancel(id,input.reason,{role:s.role,name:s.username}));}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Falha no estorno.'},{status:400});}
}
