import { describe, expect, it } from "vitest";

import { createJobInput, toJobDto, type Job } from "./jobs";

describe("createJobInput", () => {
  it("accepts a noop job", () => {
    expect(createJobInput.parse({ type: "noop" })).toEqual({ type: "noop" });
  });

  it("rejects unknown job types", () => {
    expect(createJobInput.safeParse({ type: "mine_bitcoin" }).success).toBe(
      false,
    );
  });

  it("rejects a non-uuid refId", () => {
    expect(
      createJobInput.safeParse({ type: "preflight", refId: "abc" }).success,
    ).toBe(false);
  });
});

describe("toJobDto", () => {
  it("hides worker-internal fields and serialises dates", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const job: Job = {
      id: "00000000-0000-4000-8000-000000000000",
      type: "noop",
      refId: null,
      status: "running",
      attempts: 1,
      lockedAt: now,
      runAfter: now,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const dto = toJobDto(job);
    expect(dto).not.toHaveProperty("lockedAt");
    expect(dto).not.toHaveProperty("runAfter");
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
