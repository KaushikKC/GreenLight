import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, schema } from "@/db";

import { signUserId, verifyToken } from "./session-token";

// Guest mode: reviewers can try Greenlight without signing up. Each browser
// gets a guest user behind a signed httpOnly cookie. Auth.js magic links will
// later upgrade a guest into a real account.
const COOKIE = "gl_session";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Current user id from the session cookie, or null. Safe in pages. */
export async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return verifyToken(token, secret());
}

/**
 * Current user id, creating a guest user (and cookie) if needed.
 * Only call from Route Handlers or Server Functions, which can set cookies.
 */
export async function getOrCreateUserId(): Promise<string> {
  const existing = await getUserId();
  if (existing) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, existing))
      .limit(1);
    if (user) return user.id;
  }

  const [guest] = await db
    .insert(schema.users)
    .values({ isGuest: true, name: "Guest" })
    .returning({ id: schema.users.id });

  (await cookies()).set(COOKIE, signUserId(guest.id, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
  return guest.id;
}
