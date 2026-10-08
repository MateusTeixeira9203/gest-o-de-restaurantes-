import sharp from "sharp";
import { removeBrandImage, setBrandImage, type BrandImageKind } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

function validKind(kind: string): kind is BrandImageKind {
  return kind === "logo" || kind === "cover";
}

export async function PUT(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const { kind } = await params;
    if (!validKind(kind)) return Response.json({ error: "Imagem inválida." }, { status: 400 });
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 5_000_000 || file.size < 1) throw new Error("Escolha uma imagem JPG, PNG ou WebP de até 5 MB.");
    const limit = kind === "logo" ? 800 : 1600;
    const data = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: limit, height: limit, fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "logo" ? 82 : 76 }).toBuffer();
    if (data.length > 1_000_000) throw new Error("A imagem ainda ficou grande após a otimização. Escolha outra foto.");
    return Response.json(await setBrandImage(kind, data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a imagem." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  const { kind } = await params;
  if (!validKind(kind)) return Response.json({ error: "Imagem inválida." }, { status: 400 });
  return Response.json(await removeBrandImage(kind), { headers: { "Cache-Control": "no-store" } });
}
