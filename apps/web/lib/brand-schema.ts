import { z } from "zod";

export const importInput = z.object({
  format: z.enum(["paste", "csv"]),
  text: z.string().min(1, "Paste some posts or choose a CSV.").max(2_000_000),
});

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const profileInput = z.object({
  handle: optionalText(60),
  niche: optionalText(120),
  audience: optionalText(300),
  followers: z.number().int().min(0).max(1_000_000_000).nullish().transform((v) => v ?? null),
});
export type ProfileInput = z.infer<typeof profileInput>;

export const pitchInput = z.object({
  brand: z.string().trim().min(1).max(120),
  ask: z.enum(["gifting", "paid", "affiliate"]).nullish().transform((v) => v ?? null),
  note: optionalText(500),
});
