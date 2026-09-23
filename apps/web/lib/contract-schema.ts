import { z } from "zod";

export const CONTRACT_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type ContractType = keyof typeof CONTRACT_TYPES;

export const MAX_CONTRACT_BYTES = 20 * 1024 * 1024;

export const contractUploadRequest = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(Object.keys(CONTRACT_TYPES) as [ContractType, ...ContractType[]]),
  sizeBytes: z.number().int().positive().max(MAX_CONTRACT_BYTES),
});

export const createContractInput = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("text"),
    text: z.string().trim().min(40, "Paste the full contract or deal email.").max(200_000),
  }),
  z.object({
    source: z.enum(["pdf", "docx"]),
    key: z.string().min(1).max(512),
    filename: z.string().trim().min(1).max(255),
  }),
]);
export type CreateContractInput = z.infer<typeof createContractInput>;

export function contractKey(userId: string, id: string, type: ContractType) {
  return `contracts/${userId}/${id}.${CONTRACT_TYPES[type]}`;
}

export function ownsContractKey(userId: string, key: string) {
  return key.startsWith(`contracts/${userId}/`) && !key.includes("..") && /^[\w/.-]+$/.test(key);
}

const isoDate = z.iso.date();
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const windowInput = z
  .object({
    kind: z.enum(["usage", "whitelisting", "exclusivity"]),
    scope: z.enum(["organic", "paid"]).nullish().transform((v) => v ?? null),
    platforms: z.array(z.string().trim().min(1).max(60)).max(20),
    territories: z.array(z.string().trim().min(1).max(60)).max(20),
    category: optionalText(40),
    startsAt: isoDate,
    endsAt: isoDate.nullish().transform((v) => v ?? null),
    perpetual: z.boolean(),
    durationText: optionalText(300),
    sourceQuote: optionalText(2000),
  })
  .refine((w) => w.perpetual || w.endsAt !== null, {
    message: "Add an end date, or mark it as perpetual.",
    path: ["endsAt"],
  })
  .refine((w) => w.endsAt === null || w.endsAt >= w.startsAt, {
    message: "The end date is before the start date.",
    path: ["endsAt"],
  });
export type WindowInput = z.infer<typeof windowInput>;

/** What the creator confirms on the review screen. Every window needs a real start date. */
export const confirmContractInput = z.object({
  brand: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(40),
  campaign: optionalText(200),
  signedAt: isoDate.nullish().transform((v) => v ?? null),
  feeAmount: z.number().nonnegative().max(10_000_000).nullish().transform((v) => v ?? null),
  feeCurrency: z.string().trim().length(3).toUpperCase().nullish().transform((v) => v ?? null),
  paymentTermsDays: z.number().int().min(0).max(365).nullish().transform((v) => v ?? null),
  paymentDueAt: isoDate.nullish().transform((v) => v ?? null),
  deliverables: z
    .array(
      z.object({
        platform: optionalText(60),
        format: optionalText(60),
        count: z.number().int().min(0).max(100).nullish().transform((v) => v ?? null),
        dueDate: isoDate.nullish().transform((v) => v ?? null),
      }),
    )
    .max(50),
  windows: z.array(windowInput).max(50),
  notes: optionalText(5000),
});
export type ConfirmContractInput = z.infer<typeof confirmContractInput>;
