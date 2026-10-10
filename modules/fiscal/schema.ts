import { z } from "zod";
const text = z.string().trim().max(150);
const rate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/)
  .refine((v) => Number(v) <= 100)
  .or(z.literal(""));
export const environmentSchema = z.enum(["homologation", "production"]);
export const recipientSchema = z
  .object({
    name: text.default(""),
    document: z
      .string()
      .regex(/^(\d{11}|\d{14})$/)
      .or(z.literal(""))
      .default(""),
    street: text.default(""),
    number: text.default(""),
    district: text.default(""),
    city: text.default(""),
    cityCode: z
      .string()
      .regex(/^\d{7}$/)
      .or(z.literal(""))
      .default(""),
    icmsIndicator: z.enum(["9", "1", "2"]).default("9"),
    ie: text.default(""),
    uf: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal(""))
      .default(""),
    zip: z
      .string()
      .regex(/^\d{8}$/)
      .or(z.literal(""))
      .default(""),
  })
  .strict();
export const optionsSchema = z
  .object({
    recipient: recipientSchema.default({}),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
export type FiscalOptions = z.infer<typeof optionsSchema>;
export const emptyOptions = optionsSchema.parse({});
export const issuerSchema = z
  .object({
    cnpj: z
      .string()
      .regex(/^\d{14}$/)
      .or(z.literal("")),
    legalName: text,
    ie: text,
    regime: z.enum(["", "1", "2", "3", "4"]),
    accountant: text,
    reviewed: z.boolean(),
    presentialApproved: z.boolean(),
    qrPresentialApproved: z.boolean().default(false),
    pickupApproved: z.boolean().default(false),
    deliveryApproved: z.boolean().default(false),
    servicePolicy: z.enum(["blocked", "other_expense"]).default("blocked"),
    freightApproved: z.boolean().default(false),
    discountsApproved: z.boolean().default(false),
    contingencyInstructions: z.string().trim().max(1500).default(""),
    channels: z
      .array(
        z
          .object({
            source: z.enum(["waiter", "cashier", "public_menu"]),
            fulfillment: z.enum(["dine_in", "pickup", "delivery"]),
            model: z.enum(["55", "65"]),
            presence: z.enum(["1", "2", "3", "4", "9"]),
          })
          .strict(),
      )
      .max(9)
      .default([])
      .refine(
        (rows) =>
          new Set(rows.map((r) => r.source + ":" + r.fulfillment)).size ===
          rows.length,
        "Canal repetido",
      ),
  })
  .strict();
export type Issuer = z.infer<typeof issuerSchema>;
export const emptyIssuer: Issuer = issuerSchema.parse({
  cnpj: "",
  legalName: "",
  ie: "",
  regime: "",
  accountant: "",
  reviewed: false,
  presentialApproved: false,
});
export const taxSchema = z
  .object({
    ncm: z
      .string()
      .regex(/^\d{8}$/)
      .or(z.literal("")),
    cfop: z
      .string()
      .regex(/^\d{4}$/)
      .or(z.literal("")),
    origin: z
      .string()
      .regex(/^[0-8]$/)
      .or(z.literal("")),
    icms: z
      .string()
      .regex(/^\d{2,3}$/)
      .or(z.literal("")),
    pis: z
      .string()
      .regex(/^\d{2}$/)
      .or(z.literal("")),
    cofins: z
      .string()
      .regex(/^\d{2}$/)
      .or(z.literal("")),
    cest: z
      .string()
      .regex(/^\d{7}$/)
      .or(z.literal("")),
    reviewed: z.boolean(),
    unit: z.string().trim().min(1).max(6).default("UN"),
    gtin: z
      .string()
      .regex(/^(\d{8}|\d{12,14}|SEM GTIN)$/)
      .or(z.literal(""))
      .default(""),
    addonsPolicy: z.enum(["blocked", "include"]).default("blocked"),
    icmsRate: rate.default(""),
    icmsReduction: rate.default(""),
    pisRate: rate.default(""),
    cofinsRate: rate.default(""),
    benefitCode: z.string().trim().max(10).default(""),
    retainedStDispensed: z.boolean().default(false),
    pisCofinsExcludeIcms: z.boolean().default(false),
    rtc: z
      .object({
        enabled: z.boolean(),
        cst: z.enum(["000"]),
        classification: z.string().regex(/^\d{6}$/),
        ufRate: rate,
        municipalRate: rate,
        cbsRate: rate,
        excludeLegacyTaxes: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Tax = z.infer<typeof taxSchema>;
export const emptyTax: Tax = taxSchema.parse({
  ncm: "",
  cfop: "",
  origin: "",
  icms: "",
  pis: "",
  cofins: "",
  cest: "",
  reviewed: false,
});
export const fiscalCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issuer"), data: issuerSchema }),
  z.object({
    action: z.literal("product"),
    productId: z.string().uuid(),
    data: taxSchema,
  }),
  z.object({
    action: z.literal("prepare"),
    orderIds: z.array(z.string().uuid()).min(1).max(50),
    environment: environmentSchema.default("homologation"),
    options: optionsSchema.default({}),
  }),
  z.object({
    action: z.literal("refresh"),
    documentId: z.string().uuid(),
    options: optionsSchema.optional(),
  }),
  z.object({ action: z.literal("process"), documentId: z.string().uuid() }),
  z.object({
    action: z.literal("cancel"),
    documentId: z.string().uuid(),
    reason: z.string().trim().min(15).max(255),
  }),
  z.object({ action: z.literal("files"), documentId: z.string().uuid() }),
]);
