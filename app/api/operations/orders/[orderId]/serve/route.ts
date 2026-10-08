import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { serveOrder } from "@/lib/restaurant-repository";
export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}) {
 const actor=await sessionFromRequest(request);
 if(!actor||!['admin','manager','waiter','cashier'].includes(actor.role))return Response.json({error:'Acesso operacional necessário.'},{status:403});
 try {const id=z.string().uuid().parse((await params).orderId);return Response.json(await serveOrder(id,{name:actor.username,role:actor.role}));}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Falha ao registrar atendimento.'},{status:400});}
}
