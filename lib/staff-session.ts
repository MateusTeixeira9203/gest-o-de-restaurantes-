import { createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_SESSION_COOKIE = "patos_staff_session";
export const STAFF_ROLES = ["admin", "manager", "waiter", "kitchen", "cashier"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export type SessionPayload = { username: string; role: StaffRole; staffId?: string; expiresAt: number };

function secret() {
  const value = process.env.RESTAURANT_SESSION_SECRET;
  if (!value) throw new Error("RESTAURANT_SESSION_SECRET não configurada.");
  return value;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createStaffSession(input: Pick<SessionPayload, "username" | "role" | "staffId">) {
  const payload = encode(JSON.stringify({ ...input, expiresAt: Date.now() + 1000 * 60 * 60 * 12 } satisfies SessionPayload));
  return `${payload}.${signature(payload)}`;
}

export function verifyStaffSession(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;
  try {
    const expectedSignature = signature(payload);
    const expected = Buffer.from(expectedSignature);
    const provided = Buffer.from(providedSignature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
    const session = JSON.parse(decode(payload)) as SessionPayload;
    return session.expiresAt > Date.now() && session.username && STAFF_ROLES.includes(session.role) ? session : null;
  } catch {
    return null;
  }
}

export function sessionFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${STAFF_SESSION_COOKIE}=`))?.slice(STAFF_SESSION_COOKIE.length + 1);
  return verifyStaffSession(token);
}

export function hasStaffSession(request: Request, roles?: StaffRole[]) {
  const session = sessionFromRequest(request);
  return Boolean(session && (!roles || session.role === "admin" || roles.includes(session.role)));
}
