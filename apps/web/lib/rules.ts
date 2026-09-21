import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Single source of truth shared with the analyzer. Never hard-code these.
const RULES_PATH =
  process.env.RULES_PATH ??
  path.resolve(process.cwd(), "../../services/analyzer/rules/platforms.json");

type Defaults = { max_upload_bytes: number; max_duration_s: number };

let cached: Defaults | null = null;

export function uploadLimits(): { maxBytes: number; maxDurationS: number } {
  cached ??= JSON.parse(readFileSync(RULES_PATH, "utf8")).defaults as Defaults;
  return {
    maxBytes: cached.max_upload_bytes,
    maxDurationS: cached.max_duration_s,
  };
}
