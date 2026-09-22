import { describe, expect, it } from "vitest";

import {
  diffChecks,
  diffSummary,
  formatTime,
  groupChecks,
  inUnsafeZone,
  nearestFrame,
  overlapFraction,
  timelineMarkers,
} from "./report";
import type { Check, Region } from "./report-types";

function check(id: string, status: Check["status"], extra: Partial<Check> = {}): Check {
  return {
    id,
    group: (id.split(".")[0] === "read" ? "readability" : id.split(".")[0]) as Check["group"],
    status,
    severity: "medium",
    title: id,
    explanation: "",
    fix: null,
    timestamp_s: null,
    evidence: {},
    estimate: false,
    ...extra,
  };
}

describe("groupChecks", () => {
  it("orders groups like the report and puts problems first", () => {
    const groups = groupChecks([
      check("format.aspect", "pass"),
      check("hook.text", "pass"),
      check("hook.spoken", "fail"),
      check("format.duration", "warn"),
    ]);
    expect(groups.map((g) => g.group)).toEqual(["hook", "format"]);
    expect(groups[0].checks.map((c) => c.id)).toEqual(["hook.spoken", "hook.text"]);
    expect(groups[1].issues).toBe(1);
  });

  it("drops empty groups", () => {
    expect(groupChecks([check("hook.text", "pass")])).toHaveLength(1);
  });
});

describe("timelineMarkers", () => {
  it("marks only timestamped warn/fail checks, sorted by time", () => {
    const markers = timelineMarkers(
      [
        check("read.safe_zone", "fail", { timestamp_s: 6 }),
        check("hook.text", "warn", { timestamp_s: 0 }),
        check("tech.blur", "pass", { timestamp_s: 2 }),
        check("msg.cta", "warn"),
      ],
      12,
    );
    expect(markers.map((m) => [m.id, m.pct])).toEqual([
      ["hook.text", 0],
      ["read.safe_zone", 50],
    ]);
  });

  it("clamps past the end and handles zero duration", () => {
    expect(timelineMarkers([check("a.b", "fail", { timestamp_s: 20 })], 10)[0].pct).toBe(100);
    expect(timelineMarkers([check("a.b", "fail", { timestamp_s: 1 })], 0)).toEqual([]);
  });
});

describe("diffChecks", () => {
  const before = [
    check("read.safe_zone", "fail"),
    check("comp.disclosure", "fail"),
    check("audio.loudness", "warn"),
    check("hook.text", "pass"),
  ];

  it("splits fixed, remaining and new issues", () => {
    const after = [
      check("read.safe_zone", "pass"),
      check("comp.disclosure", "pass"),
      check("audio.loudness", "warn"),
      check("hook.text", "warn"),
    ];
    const d = diffChecks(before, after);
    expect(d.fixed.map((c) => c.id)).toEqual(["read.safe_zone", "comp.disclosure"]);
    expect(d.remaining.map((c) => c.id)).toEqual(["audio.loudness"]);
    expect(d.introduced.map((c) => c.id)).toEqual(["hook.text"]);
    expect(diffSummary(d)).toBe("2 issues fixed, 1 remaining, 1 new");
  });

  it("does not count an errored check as fixed", () => {
    const d = diffChecks([check("msg.claims", "warn")], [check("msg.claims", "error")]);
    expect(d.fixed).toEqual([]);
  });

  it("uses singular wording", () => {
    const d = diffChecks([check("a.b", "fail")], [check("a.b", "pass")]);
    expect(diffSummary(d)).toBe("1 issue fixed, 0 remaining");
  });
});

describe("safe-zone geometry", () => {
  const bottom: Region = { name: "bottom", platform: "tiktok", x: 0, y: 0.78, w: 1, h: 0.22 };

  it("measures the box share inside a region", () => {
    expect(overlapFraction([0.1, 0.85, 0.8, 0.06], bottom)).toBeCloseTo(1);
    expect(overlapFraction([0.2, 0.4, 0.6, 0.05], bottom)).toBe(0);
    expect(overlapFraction([0.2, 0.74, 0.6, 0.05], bottom)).toBeCloseTo(0.2);
  });

  it("applies the minimum overlap threshold", () => {
    expect(inUnsafeZone([0.2, 0.74, 0.6, 0.05], [bottom], 0.3)).toBe(false);
    expect(inUnsafeZone([0.2, 0.8, 0.6, 0.05], [bottom], 0.3)).toBe(true);
  });
});

describe("misc", () => {
  it("finds the nearest sampled frame", () => {
    expect(nearestFrame([{ t: 0 }, { t: 3 }, { t: 6 }], 4.2).t).toBe(3);
  });

  it("formats short and long times", () => {
    expect(formatTime(6.87)).toBe("6.9s");
    expect(formatTime(75)).toBe("1:15");
  });
});
