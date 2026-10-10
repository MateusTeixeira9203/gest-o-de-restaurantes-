import { z } from "zod";
const cents = z.number().int().positive().max(2_000_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Data inválida");
const text = z.string().trim().min(3).max(300);
export const periodSchema = z
  .object({ from: date, to: date })
  .refine((value) => value.from <= value.to, "Período inválido");
export const commandSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("create_series"), mode:z.enum(["installments","recurring"]), count:z.number().int().min(2).max(60), kind:z.enum(["payable","receivable"]), title:text, contact:z.string().trim().max(150).default(""), category:z.enum(["operating","tax","stock","capital","other_income"]), amountCents:cents, competenceDate:date, dueDate:date}),
  z.object({action:z.literal("stop_series"), seriesId:z.string().uuid(), reason:text}),
  z.object({action:z.literal("create_purchase"), supplier:z.string().trim().min(2).max(150), reference:z.string().trim().min(1).max(80), purchasedOn:date, dueDate:date, count:z.number().int().min(1).max(60), lines:z.array(z.object({itemId:z.string().uuid(), quantity:z.number().positive().max(1000000000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.00001), unit:z.enum(["un","g","kg","ml","L"]), totalCents:cents})).min(1).max(50)}),
  z.object({action:z.literal("cancel_purchase"), purchaseId:z.string().uuid(), reason:text}),
  z.object({action:z.literal("receive_purchase"), purchaseId:z.string().uuid(), lines:z.array(z.object({lineId:z.string().uuid(), quantity:z.number().positive().max(1000000000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.00001), unit:z.enum(["un","g","kg","ml","L"])})).min(1).max(50)}),

  z.object({
    action: z.literal("service_payout"),
    amountCents: cents,
    account: z.enum(["cash", "bank"]),
    description: text,
  }),
  z.object({
    action: z.literal("open_shift"),
    openingCents: cents.or(z.literal(0)),
  }),
  z.object({
    action: z.literal("close_shift"),
    shiftId: z.string().uuid(),
    countedCents: cents.or(z.literal(0)),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("cash_move"),
    kind: z.enum(["topup", "withdrawal"]),
    amountCents: cents,
    description: text,
  }),
  z.object({
    action: z.literal("opening_bank"),
    amountCents: cents,
    description: text,
  }),
  z.object({
    action: z.literal("create_document"),
    kind: z.enum(["payable", "receivable"]),
    title: text,
    contact: z.string().trim().max(150).default(""),
    category: z.enum(["operating", "tax", "stock", "capital", "other_income"]),
    amountCents: cents,
    competenceDate: date,
    dueDate: date,
  }),
  z.object({
    action: z.literal("settle_document"),
    documentId: z.string().uuid(),
    amountCents: cents,
    paidOn: date,
    account: z.enum(["cash", "bank"]),
  }),
  z.object({
    action: z.literal("reverse_settlement"),
    settlementId: z.string().uuid(),
    reason: text,
  }),
  z.object({
    action: z.literal("cancel_document"),
    documentId: z.string().uuid(),
    reason: text,
  }),
  z.object({
    action: z.literal("reconcile_card"),
    paymentId: z.string().uuid(),
    netCents: cents,
    paidOn: date,
    reference: text,
  }),
]);
export type FinanceCommand = z.infer<typeof commandSchema>;
