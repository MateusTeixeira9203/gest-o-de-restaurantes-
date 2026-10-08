import { z } from "zod";
import { approveOrder, rejectOrder } from "@/lib/restaurant-repository";
import { sessionFromRequest } from "@/lib/staff-session";
const bodySchema = z.object({ decision:z.enum(["approve","reject"]), revision:z.number().int().positive(), reason:z.string().trim().min(3).max(500).optional() });
export async function POST(request:Request, context:{params:Promise<{orderId:string}>}) {
  const session = await sessionFromRequest(request);
  if (!session || !["admin","manager","waiter","cashier"].includes(session.role)) return Response.json({error:"Acesso de garçom ou caixa necessário."},{status:403});
  try {
    const {orderId}=await context.params; z.string().uuid().parse(orderId);
    const body=bodySchema.parse(await request.json());
    const actor={role:session.role,name:session.username,staffId:session.staffId};
    if(body.decision==='reject' && !body.reason) throw new Error("Informe o motivo da recusa.");
    const order=body.decision==='approve'?await approveOrder(orderId,body.revision,actor):await rejectOrder(orderId,body.revision,body.reason!,actor);
    return Response.json({order});
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"Falha ao conferir pedido."},{status:400}); }
}
