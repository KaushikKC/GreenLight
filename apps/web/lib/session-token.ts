import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie value format: `<userId>.<base64url HMAC-SHA256(userId)>`. */
export function signUserId(userId: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function verifyToken(
  token: string | undefined,
  secret: string,
): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const expected = Buffer.from(signUserId(userId, secret));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? userId : null;
}
