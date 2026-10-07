import { z } from "zod";

const price = z.number().int().min(0).max(10_000_000);

export const menuProductSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).default(""),
  category: z.string().trim().min(2).max(50),
  sector: z.string().trim().min(2).max(50),
  available: z.boolean().default(true),
  featured: z.boolean().default(false),
  variants: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), priceCents: price })).min(1).max(12),
  addons: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), priceCents: price })).max(20).default([]),
});
