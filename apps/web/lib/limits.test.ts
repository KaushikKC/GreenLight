import { describe, expect, it } from "vitest";

import { decide, LIMITS } from "./limits";

describe("decide", () => {
  it("allows requests under every window", () => {
    expect(decide("guest", "preflights", { hour: 0, day: 0 })).toEqual({ ok: true });
  });

  it("blocks at the hourly limit with a retry hint", () => {
    const max = LIMITS.guest.preflights.find((r) => r.per === "hour")!.max;
    const d = decide("guest", "preflights", { hour: max, day: max });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.per).toBe("hour");
      expect(d.retryAfterS).toBe(3600);
      expect(d.message).toContain("per hour for guests");
      expect(d.message).toContain("about an hour");
    }
  });

  it("checks the daily window too", () => {
    const day = LIMITS.guest.preflights.find((r) => r.per === "day")!.max;
    const d = decide("guest", "preflights", { hour: 0, day });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.message).toContain("tomorrow");
  });

  it("counts a whole batch and says how many are left", () => {
    const d = decide("guest", "posts", { day: 990 }, 20);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.message).toBe("You can add 10 more posts today. Try a smaller batch, or again tomorrow.");
  });

  it("gives signed-in users a higher tier", () => {
    const guestMax = LIMITS.guest.contracts[0].max;
    expect(decide("guest", "contracts", { day: guestMax }).ok).toBe(false);
    expect(decide("user", "contracts", { day: guestMax }).ok).toBe(true);
  });
});
