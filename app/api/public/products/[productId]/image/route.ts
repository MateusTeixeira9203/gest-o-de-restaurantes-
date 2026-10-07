import { getProductImage } from "@/lib/restaurant-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const image = await getProductImage((await params).productId);
    if (!image) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(image.image_data), { headers: { "Content-Type": image.mime_type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
