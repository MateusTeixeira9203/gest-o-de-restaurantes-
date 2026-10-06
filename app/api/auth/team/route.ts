import { listStaffMembers } from "@/lib/restaurant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const team = await listStaffMembers(true);
  return Response.json({ team: team.map(member => ({ id: member.id, name: member.name, role: member.role })) }, { headers: { "Cache-Control": "no-store" } });
}
