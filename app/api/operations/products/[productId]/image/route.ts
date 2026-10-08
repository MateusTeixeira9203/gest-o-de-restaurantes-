import sharp from "sharp";
import { setProductImage } from "@/lib/restaurant-repository";
import { hasStaffSession } from "@/lib/staff-session";

export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!(await hasStaffSession(request, ["manager"]))) return Response.json({ error: "Acesso de gestão necessário." }, { status: 403 });
  try {
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 5_000_000 || file.size < 1) throw new Error("Escolha uma imagem de até 5 MB.");
    const data = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 960, height: 960, fit: "cover", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
    if (data.length > 600_000) throw new Error("A imagem ainda é grande após a otimização. Escolha outra foto.");
    return Response.json(await setProductImage((await params).productId, data));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a imagem." }, { status: 400 });
  }
}
