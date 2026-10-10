import { z } from "zod";
import { sessionFromRequest } from "@/lib/staff-session";
import { transaction } from "@/lib/database";
import { receivingSettings } from "@/modules/payments/checkout";
import { normalizePixText, staticPix } from "@/modules/payments/pix";
const schema = z.object({ enabled: z.boolean(), key: z.string().trim().max(77), name: z.string().trim().max(100), city: z.string().trim().max(100) });
export async function GET(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin","manager"].includes(s.role)) return Response.json({error:"Acesso de gestão necessário."},{status:403});
  const v = await receivingSettings(s.restaurantId);
  return Response.json({enabled:v.pix_enabled,key:v.pix_key,name:v.pix_name,city:v.pix_city},{headers:{"Cache-Control":"no-store"}});
}
export async function PUT(request: Request) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin","manager"].includes(s.role)) return Response.json({error:"Acesso de gestão necessário."},{status:403});
  try {
    const v = schema.parse(await request.json());
    const name = normalizePixText(v.name,25), city = normalizePixText(v.city,15);
    if (v.enabled) {
      if (!/^(?:\d{11}|\d{14}|\+[1-9]\d{7,14}|[^\s@]+@[^\s@]+\.[^\s@]+|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/.test(v.key)) throw new Error("Informe a chave Pix sem formatação; telefone com +55, ou CPF/CNPJ, e-mail ou chave aleatória.");
      staticPix({key:v.key,name,city});
    }
    await transaction(async client=> {
      await client.query(`INSERT INTO restaurant_payment_settings(restaurant_id,pix_enabled,pix_key,pix_name,pix_city,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(restaurant_id) DO UPDATE SET pix_enabled=$2,pix_key=$3,pix_name=$4,pix_city=$5,updated_by=$6,updated_at=now()`,[s.restaurantId,v.enabled,v.key,name,city,s.username]);
      await client.query("INSERT INTO payment_settings_events(restaurant_id,actor_name,pix_enabled) VALUES($1,$2,$3)",[s.restaurantId,s.username,v.enabled]);
    });
    return Response.json({ok:true});
  } catch(error) { return Response.json({error:error instanceof z.ZodError ? "Configuração Pix inválida." : error instanceof Error ? error.message : "Não foi possível salvar."},{status:400}); }
}
