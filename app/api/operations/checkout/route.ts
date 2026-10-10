import { z } from "zod";
import QRCode from "qrcode";
import { createHash } from "node:crypto";
import { sessionFromRequest } from "@/lib/staff-session";
import { checkoutAccount, receivingSettings } from "@/modules/payments/checkout";
import { staticPix } from "@/modules/payments/pix";
export async function POST(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin","manager","waiter","cashier"].includes(s.role)) return Response.json({error:"Acesso operacional necessário."},{status:403});
  try {
    const body = z.object({tableNumber:z.number().int().positive().max(200),amountCents:z.number().int().positive().max(2_000_000_000).optional()}).parse(await request.json());
    const account = await checkoutAccount(body.tableNumber);
    if (account.pending) throw new Error("Confira os pedidos pendentes antes de receber.");
    if (account.dueCents<=0) throw new Error("Não há saldo a receber.");
    const amountCents = body.amountCents ?? account.dueCents;
    if (amountCents>account.dueCents) throw new Error("O valor Pix supera o saldo da conta.");
    const config = await receivingSettings(s.restaurantId);
    const reference = createHash("sha256").update(s.restaurantId+account.version+amountCents+config.pix_key).digest("hex").slice(0,25);
    const code = config.pix_enabled ? staticPix({key:config.pix_key,name:config.pix_name,city:config.pix_city,amountCents,reference}) : null;
    return Response.json({version:account.version,dueCents:account.dueCents,amountCents,pix:code?{code,image:await QRCode.toDataURL(code,{width:320,margin:4,errorCorrectionLevel:"M"}),receiver:config.pix_name,reference}:null,confirmation:"manual",terminalConnected:false},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return Response.json({error:error instanceof z.ZodError ? "Dados de fechamento inválidos." : error instanceof Error ? error.message : "Não foi possível abrir a conta."},{status:400}); }
}
