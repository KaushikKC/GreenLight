import { describe, expect, it } from "vitest";

import {
  createPreflightInput,
  ownsKey,
  uploadRequest,
  videoKey,
} from "./preflight-schema";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("uploadRequest", () => {
  it("accepts mp4 and mov", () => {
    for (const contentType of ["video/mp4", "video/quicktime"]) {
      expect(
        uploadRequest.safeParse({ filename: "a", contentType, sizeBytes: 10 })
          .success,
      ).toBe(true);
    }
  });

  it("rejects other types and empty files", () => {
    expect(
      uploadRequest.safeParse({
        filename: "a.gif",
        contentType: "image/gif",
        sizeBytes: 10,
      }).success,
    ).toBe(false);
    expect(
      uploadRequest.safeParse({
        filename: "a",
        contentType: "video/mp4",
        sizeBytes: 0,
      }).success,
    ).toBe(false);
  });
});

describe("createPreflightInput", () => {
  it("turns blank optional fields into undefined", () => {
    const parsed = createPreflightInput.parse({
      key: "k",
      filename: "f.mp4",
      platform: "both",
      briefText: "   ",
      brandName: "Glossier",
    });
    expect(parsed.briefText).toBeUndefined();
    expect(parsed.brandName).toBe("Glossier");
  });

  it("rejects an unknown platform", () => {
    expect(
      createPreflightInput.safeParse({
        key: "k",
        filename: "f",
        platform: "youtube",
      }).success,
    ).toBe(false);
  });
});

describe("key ownership", () => {
  const key = videoKey(USER, "abc", "video/quicktime");

  it("builds keys under the user's prefix", () => {
    expect(key).toBe(`videos/${USER}/abc.mov`);
    expect(ownsKey(USER, key)).toBe(true);
  });

  it("rejects another user's key", () => {
    expect(ownsKey(OTHER, key)).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(ownsKey(USER, `videos/${USER}/../${OTHER}/abc.mp4`)).toBe(false);
  });
});
