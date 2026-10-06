import { timingSafeEqual } from "node:crypto";
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
    const { username, password } = credentialsSchema.parse(await request.json());
    const configuredUser = process.env.RESTAURANT_ADMIN_USER;
    const configuredPassword = process.env.RESTAURANT_ADMIN_PASSWORD;
    const matchesUser = Boolean(configuredUser && sameValue(username, configuredUser));
    const matchesPassword = Boolean(configuredPassword && sameValue(password, configuredPassword));
    const member = matchesUser && matchesPassword ? null : await authenticateStaffMember(username, password);
    if (!member && !(matchesUser && matchesPassword)) return Response.json({ error: "Nome ou PIN inválido." }, { status: 401 });
    const session = member ? { username: member.name, role: member.role, staffId: member.id } : { username, role: "admin" as const };
    const response = Response.json({ ok: true, ...session });
    response.headers.append("Set-Cookie", `${STAFF_SESSION_COOKIE}=${createStaffSession(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch {
    return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 });
  }
}
