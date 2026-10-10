import type { Environment } from "../integrations/contracts.ts";
export const focusHosts = {
  homologation: "https://homologacao.focusnfe.com.br",
  production: "https://api.focusnfe.com.br",
} as const;
// Server-only credentials. Never return this object to the browser or persist it in a fiscal snapshot.
export function focusAvailability(
  rid: string,
  environment: Environment = "homologation",
) {
  let token = "",
    cnpj = "",
    approved = false;
  try {
    const entry = JSON.parse(process.env.FOCUS_NFE_CONNECTIONS || "{}")[rid]?.[
      environment
    ];
    if (entry) {
      token = typeof entry.token === "string" ? entry.token : "";
      cnpj = typeof entry.cnpj === "string" ? entry.cnpj : "";
      approved = entry.productionApproved === true;
    }
    if (!token && environment === "homologation") {
      const legacy = JSON.parse(
        process.env.FOCUS_NFE_HOMOLOGATION_TOKENS || "{}",
      )[rid];
      token = typeof legacy === "string" ? legacy : "";
    }
  } catch {
    /* Invalid configuration fails closed. */
  }
  const enabled =
    Boolean(token) &&
    (environment === "homologation"
      ? process.env.FOCUS_NFE_HOMOLOGATION_ENABLED === "true"
      : process.env.FOCUS_NFE_PRODUCTION_ENABLED === "true" &&
        approved &&
        /^\d{14}$/.test(cnpj));
  return { token, cnpj, environment, enabled, productionApproved: approved };
}
