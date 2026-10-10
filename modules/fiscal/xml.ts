import { XMLParser, XMLValidator } from "fast-xml-parser";
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
});
export function validateFiscalXml(
  content: Buffer,
  key: string,
  cnpj: string,
  kind: string,
) {
  const xml = content.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("XML inválido.");
  const data = parser.parse(xml);
  if (kind === "xml") {
    const note = data.nfeProc?.NFe?.infNFe,
      protocol = data.nfeProc?.protNFe?.infProt;
    if (
      note?.["@Id"] !== `NFe${key}` ||
      note?.emit?.CNPJ !== cnpj ||
      protocol?.chNFe !== key ||
      !["100", "150"].includes(protocol?.cStat) ||
      !/^\d{15}$/.test(protocol?.nProt || "")
    )
      throw new Error("XML sem autorização compatível.");
    return {
      protocol: String(protocol.nProt),
      number: String(Number(key.slice(25, 34))),
      series: String(Number(key.slice(22, 25))),
    };
  } else if (kind === "cancellation") {
    const event = data.procEventoNFe?.evento?.infEvento,
      result = data.procEventoNFe?.retEvento?.infEvento;
    if (
      event?.chNFe !== key ||
      event?.CNPJ !== cnpj ||
      event?.tpEvento !== "110111" ||
      result?.chNFe !== key ||
      !["135", "155"].includes(result?.cStat)
    )
      throw new Error("Evento de cancelamento incompatível.");
  }
}
