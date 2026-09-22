import "server-only";

// Single source of truth shared with the analyzer. Never hard-code these.
// Imported (not read from disk) so the bundle carries exactly this file.
import platformsJson from "../../../services/analyzer/rules/platforms.json";

import type { Region } from "./report-types";

type RawRegion = Omit<Region, "platform"> & { status?: string };
type RawRules = {
  defaults: {
    max_upload_bytes: number;
    max_duration_s: number;
    safe_zone_min_overlap: number;
  };
  tiktok: { unsafe_regions: RawRegion[] };
  reels: { unsafe_regions: RawRegion[] };
};

const raw = (): RawRules => platformsJson as unknown as RawRules;

export function uploadLimits(): { maxBytes: number; maxDurationS: number } {
  const d = raw().defaults;
  return { maxBytes: d.max_upload_bytes, maxDurationS: d.max_duration_s };
}

/** Unsafe UI regions for a platform; "both" is the union, as in the analyzer. */
export function safeZones(platform: "tiktok" | "reels" | "both"): {
  regions: Region[];
  minOverlap: number;
} {
  const r = raw();
  const names = platform === "both" ? (["tiktok", "reels"] as const) : [platform];
  const regions = names.flatMap((p) =>
    r[p].unsafe_regions.map(({ name, x, y, w, h }) => ({ name, platform: p, x, y, w, h })),
  );
  return { regions, minOverlap: r.defaults.safe_zone_min_overlap };
}
