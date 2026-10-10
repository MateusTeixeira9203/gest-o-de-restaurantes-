import { sessionFromRequest } from "@/lib/staff-session";
import { requireProfessional } from "@/modules/tenancy/context";
import { query } from "@/lib/database";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const s = await sessionFromRequest(request);
  if (!s || !["admin", "manager", "cashier"].includes(s.role))
    return new Response(null, { status: 403 });
  try {
    await requireProfessional();
    const id = z
      .string()
      .uuid()
      .parse((await params).fileId);
    const f = (
      await query(
        "SELECT content,mime,kind,document_id FROM fiscal_files WHERE restaurant_id=$1 AND id=$2",
        [s.restaurantId, id],
      )
    ).rows[0];
    if (!f) return new Response(null, { status: 404 });
    await query(
      "INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail) VALUES($1,$2,$3,'downloaded',$4)",
      [s.restaurantId, f.document_id, s.username, { fileId: id }],
    );
    return new Response(new Uint8Array(f.content), {
      headers: {
        "Content-Type": f.mime,
        "Content-Security-Policy":
          "sandbox; default-src 'none'; img-src data: https://homologacao.focusnfe.com.br https://api.focusnfe.com.br; style-src 'unsafe-inline'; frame-ancestors 'self'",
        "Content-Disposition": `${new URL(request.url).searchParams.get("preview") === "1" && f.kind === "auxiliary" ? "inline" : "attachment"}; filename="${f.kind}.${f.mime === "application/pdf" ? "pdf" : f.mime === "text/html" ? "html" : "xml"}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 400 });
  }
}
