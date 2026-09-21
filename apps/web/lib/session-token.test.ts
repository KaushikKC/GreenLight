import { describe, expect, it } from "vitest";

import { signUserId, verifyToken } from "./session-token";

const ID = "3f1e2d4c-0000-4000-8000-000000000001";

describe("session token", () => {
  it("round-trips a user id", () => {
    expect(verifyToken(signUserId(ID, "s3cret"), "s3cret")).toBe(ID);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyToken(signUserId(ID, "other"), "s3cret")).toBeNull();
  });

  it("rejects a tampered user id", () => {
    const [, mac] = signUserId(ID, "s3cret").split(".");
    expect(verifyToken(`${ID.replace("1", "2")}.${mac}`, "s3cret")).toBeNull();
  });

  it("rejects missing or malformed tokens", () => {
    expect(verifyToken(undefined, "s3cret")).toBeNull();
    expect(verifyToken("no-dot-here", "s3cret")).toBeNull();
    expect(verifyToken(".abc", "s3cret")).toBeNull();
  });
});
