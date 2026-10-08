import { createHash, timingSafeEqual } from "node:crypto";
import { restaurantContext } from "@/modules/tenancy/context";
import { query } from "@/lib/database";
import { z } from "zod";
import { authenticateStaffMember } from "@/lib/restaurant-repository";
import { createStaffSession, STAFF_SESSION_COOKIE } from "@/lib/staff-session";

const credentialsSchema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });

function sameValue(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function POST(request: Request) {
  try {
    const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Origem não autorizada.'},{status:403});
    const { username, password } = credentialsSchema.parse(await request.json());
    const restaurant = await restaurantContext();
    const identity=createHash('sha256').update(username.toLocaleLowerCase('pt-BR')).digest('hex');
    const throttle=(await query<{attempts:number}>(`INSERT INTO authentication_attempts(restaurant_id,identity_hash,attempts) VALUES($1,$2,1) ON CONFLICT(restaurant_id,identity_hash) DO UPDATE SET attempts=CASE WHEN authentication_attempts.window_started_at<now()-interval '15 minutes' THEN 1 ELSE authentication_attempts.attempts+1 END, window_started_at=CASE WHEN authentication_attempts.window_started_at<now()-interval '15 minutes' THEN now() ELSE authentication_attempts.window_started_at END RETURNING attempts`,[restaurant.id,identity])).rows[0];
    if(throttle.attempts>10)return Response.json({error:'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.'},{status:429});
    const configuredUser = process.env.RESTAURANT_ADMIN_USER;
    const configuredPassword = process.env.RESTAURANT_ADMIN_PASSWORD;
    const matchesUser = Boolean(configuredUser && sameValue(username, configuredUser));
    const matchesPassword = Boolean(configuredPassword && sameValue(password, configuredPassword));
    const member = matchesUser && matchesPassword ? null : await authenticateStaffMember(username, password);
    if (!member && !(matchesUser && matchesPassword)) return Response.json({ error: "Nome ou PIN inválido." }, { status: 401 });
    const session = member ? { username: member.name, role: member.role, staffId: member.id } : { username, role: "admin" as const };
    await query("DELETE FROM authentication_attempts WHERE restaurant_id=$1 AND identity_hash=$2",[restaurant.id,identity]);
    const response = Response.json({ ok: true, ...session });
    response.headers.append("Set-Cookie", `${STAFF_SESSION_COOKIE}=${createStaffSession({...session,restaurantId:restaurant.id})}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch {
    return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 });
  }
}
