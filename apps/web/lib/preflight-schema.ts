import { z } from "zod";

export const VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
} as const;
export type VideoType = keyof typeof VIDEO_TYPES;

export const platforms = ["tiktok", "reels", "both"] as const;

export const uploadRequest = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(Object.keys(VIDEO_TYPES) as [VideoType, ...VideoType[]]),
  sizeBytes: z.number().int().positive(),
});
export type UploadRequest = z.infer<typeof uploadRequest>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createPreflightInput = z.object({
  key: z.string().min(1).max(512),
  filename: z.string().trim().min(1).max(255),
  platform: z.enum(platforms),
  briefText: optionalText(10_000),
  captionText: optionalText(2_200),
  brandName: optionalText(100),
  /** Set when this upload is a re-check of an earlier preflight. */
  parentId: z.uuid().optional(),
});
export type CreatePreflightInput = z.infer<typeof createPreflightInput>;

/** Storage key for a user's upload. The prefix proves ownership later. */
export function videoKey(userId: string, id: string, contentType: VideoType) {
  return `${userPrefix(userId)}${id}.${VIDEO_TYPES[contentType]}`;
}

export function userPrefix(userId: string) {
  return `videos/${userId}/`;
}

export function ownsKey(userId: string, key: string) {
  return (
    key.startsWith(userPrefix(userId)) &&
    !key.includes("..") &&
    /^[\w/.-]+$/.test(key)
  );
}
