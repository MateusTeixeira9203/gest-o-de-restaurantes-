import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
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
    if (!configuredUser || !configuredPassword || !sameValue(username, configuredUser) || !sameValue(password, configuredPassword)) {
      return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }
    const response = Response.json({ ok: true, username });
    response.headers.append("Set-Cookie", `${STAFF_SESSION_COOKIE}=${createStaffSession(username)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch {
    return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 });
  }
}
