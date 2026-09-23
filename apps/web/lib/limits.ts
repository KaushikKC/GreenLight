/** Rate-limit decisions (pure). DB counting lives in limits-server.ts. */

import limitsJson from "../../../services/analyzer/rules/limits.json";

export type LimitKind = "preflights" | "contracts" | "posts" | "pitches";
export type Window = "hour" | "day";
export type Tier = "guest" | "user";

export const WINDOW_SECONDS: Record<Window, number> = { hour: 3600, day: 86_400 };

type Rule = { per: Window; max: number };
export const LIMITS = limitsJson as unknown as Record<Tier, Record<LimitKind, Rule[]>>;

export type Decision =
  | { ok: true }
  | { ok: false; kind: LimitKind; per: Window; max: number; retryAfterS: number; message: string };

const NOUNS: Record<LimitKind, [string, string]> = {
  preflights: ["check", "checks"],
  contracts: ["contract", "contracts"],
  posts: ["post", "posts"],
  pitches: ["pitch draft", "pitch drafts"],
};

/**
 * `used[per]` is how many were created in that window; `adding` is how many
 * this request would add. Returns the first window that would be exceeded.
 */
export function decide(
  tier: Tier,
  kind: LimitKind,
  used: Partial<Record<Window, number>>,
  adding = 1,
  limits = LIMITS,
): Decision {
  for (const rule of limits[tier][kind]) {
    const count = used[rule.per] ?? 0;
    if (count + adding > rule.max) {
      const [one, many] = NOUNS[kind];
      const when = rule.per === "hour" ? "in about an hour" : "tomorrow";
      const left = Math.max(rule.max - count, 0);
      return {
        ok: false,
        kind,
        per: rule.per,
        max: rule.max,
        retryAfterS: WINDOW_SECONDS[rule.per],
        message:
          left > 0 && adding > 1
            ? `You can add ${left} more ${left === 1 ? one : many} ${rule.per === "day" ? "today" : "this hour"}. Try a smaller batch, or again ${when}.`
            : `You've reached the limit of ${rule.max} ${rule.max === 1 ? one : many} per ${rule.per}${
                tier === "guest" ? " for guests" : ""
              }. Try again ${when}.`,
      };
    }
  }
  return { ok: true };
}
