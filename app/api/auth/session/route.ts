import { sessionFromRequest } from "@/lib/staff-session";

export async function GET(request: Request) {
  const session = sessionFromRequest(request);
  return Response.json({ authenticated: Boolean(session), username: session?.username ?? null }, { headers: { "Cache-Control": "no-store" } });
}
