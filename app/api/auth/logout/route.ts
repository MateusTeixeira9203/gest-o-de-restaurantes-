import { STAFF_SESSION_COOKIE } from "@/lib/staff-session";

export async function POST() {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${STAFF_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
