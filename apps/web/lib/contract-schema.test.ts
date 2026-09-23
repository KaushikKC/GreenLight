import { describe, expect, it } from "vitest";

import {
  confirmContractInput,
  contractKey,
  contractUploadRequest,
  createContractInput,
  ownsContractKey,
  windowInput,
} from "./contract-schema";

const USER = "11111111-1111-4111-8111-111111111111";

const window = {
  kind: "whitelisting",
  platforms: ["TikTok"],
  territories: [],
  startsAt: "2026-03-20",
  endsAt: "2026-06-18",
  perpetual: false,
};

describe("windowInput", () => {
  it("requires a real start date (never guessed)", () => {
    expect(windowInput.safeParse({ ...window, startsAt: null }).success).toBe(false);
  });

  it("requires an end date unless perpetual", () => {
    expect(windowInput.safeParse({ ...window, endsAt: null }).success).toBe(false);
    expect(windowInput.safeParse({ ...window, endsAt: null, perpetual: true }).success).toBe(true);
  });

  it("rejects an end before the start", () => {
    const r = windowInput.safeParse({ ...window, endsAt: "2026-03-01" });
    expect(r.success).toBe(false);
  });
});

describe("confirmContractInput", () => {
  it("normalises optional fields to null and uppercases currency", () => {
    const parsed = confirmContractInput.parse({
      brand: " Glow Serum ",
      category: "skincare",
      feeAmount: 2500,
      feeCurrency: "gbp",
      deliverables: [],
      windows: [window],
      campaign: "",
    });
    expect(parsed.brand).toBe("Glow Serum");
    expect(parsed.feeCurrency).toBe("GBP");
    expect(parsed.campaign).toBeNull();
    expect(parsed.paymentDueAt).toBeNull();
  });
});

describe("createContractInput", () => {
  it("accepts pasted text or an uploaded file", () => {
    expect(createContractInput.safeParse({ source: "text", text: "x".repeat(50) }).success).toBe(true);
    expect(createContractInput.safeParse({ source: "pdf", key: "k", filename: "a.pdf" }).success).toBe(true);
    expect(createContractInput.safeParse({ source: "text", text: "too short" }).success).toBe(false);
  });
});

describe("contract uploads", () => {
  it("allows PDF and DOCX only, under 20 MB", () => {
    const ok = { filename: "a.pdf", contentType: "application/pdf", sizeBytes: 1000 };
    expect(contractUploadRequest.safeParse(ok).success).toBe(true);
    expect(contractUploadRequest.safeParse({ ...ok, contentType: "image/png" }).success).toBe(false);
    expect(contractUploadRequest.safeParse({ ...ok, sizeBytes: 21 * 1024 * 1024 }).success).toBe(false);
  });

  it("scopes keys to the user", () => {
    const key = contractKey(USER, "abc", "application/pdf");
    expect(key).toBe(`contracts/${USER}/abc.pdf`);
    expect(ownsContractKey(USER, key)).toBe(true);
    expect(ownsContractKey("someone-else", key)).toBe(false);
  });
});
