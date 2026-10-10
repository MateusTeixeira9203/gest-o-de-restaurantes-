// BR Code: BCB Manual de Padrões para Iniciação do Pix, seção QR estático.
export function crc16(value: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function field(id: string, value: string) {
  const length = Buffer.byteLength(value, "utf8");
  if (length > 99) throw new Error("Campo Pix excede o limite permitido.");
  return id + String(length).padStart(2, "0") + value;
}
export function normalizePixText(value: string, max: number) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 /.-]/g, "").trim().slice(0, max);
}
export function staticPix(input: { key: string; name: string; city: string; amountCents?: number; reference?: string }) {
  const name = normalizePixText(input.name, 25), city = normalizePixText(input.city, 15);
  if (!name || !city || !input.key || Buffer.byteLength(input.key) > 77) throw new Error("Configure chave, recebedor e cidade do Pix.");
  if (input.amountCents !== undefined && (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 2_000_000_000)) throw new Error("Valor Pix inválido.");
  const ref = input.reference ?? "***";
  if (ref !== "***" && !/^[a-zA-Z0-9]{1,25}$/.test(ref)) throw new Error("Referência Pix inválida.");
  const body = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", input.key)) + field("52", "0000") + field("53", "986") + (input.amountCents === undefined ? "" : field("54", (input.amountCents / 100).toFixed(2))) + field("58", "BR") + field("59", name) + field("60", city) + field("62", field("05", ref)) + "6304";
  return body + crc16(body);
}
