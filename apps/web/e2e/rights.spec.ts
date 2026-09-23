import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test("paste contract → review with sources → date relative window → wallet", async ({ page }) => {
  // 1. Paste the contract.
  await page.goto("/rights");
  await expect(page.getByTestId("rights-disclaimer")).toHaveText(
    "Greenlight organises your contracts; it isn't legal advice.",
  );
  await page.getByRole("link", { name: "Add contract" }).first().click();
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Contract text").fill(readFileSync(fixture("contract-glow.txt"), "utf8"));
  await page.getByRole("button", { name: "Extract the terms" }).click();

  // 2. Review: red flags, sources, relative date that must be entered.
  await expect(page).toHaveURL(/\/rights\/[0-9a-f-]{36}\/review$/);
  await expect(page.getByTestId("review-form")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("red-flags")).toContainText("Slow payment");
  await expect(page.getByTestId("rights-disclaimer")).toBeVisible();

  // Tapping a field's Source shows the contract with that wording highlighted.
  await page.locator('[data-testid="quote-button"][title*="£2,500"]').click();
  await expect(page.getByTestId("quote-highlight")).toContainText("£2,500");
  await page.getByRole("button", { name: "Back to terms" }).click(); // phone layout

  const confirm = page.getByTestId("confirm");
  await expect(page.getByTestId("missing-dates")).toContainText("1 date to fill in");
  await expect(confirm).toBeDisabled();

  const whitelisting = page.locator('[data-kind="whitelisting"]');
  await expect(whitelisting.getByTestId("needs-date")).toContainText("90 days");
  await whitelisting.getByLabel("Starts").fill("2026-03-20");
  await expect(whitelisting.getByLabel("Ends")).toHaveValue("2026-06-18"); // 90 days from the contract's wording
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // 3. Wallet: timeline, alerts, deal.
  await expect(page).toHaveURL(/\/rights$/);
  await expect(page.getByTestId("deal")).toContainText("Glow Serum");
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("today-line")).toBeVisible();

  // Estimated due date (10 Apr + 90 days) is in the past → overdue alert; mark it paid.
  const overdue = page.locator('[data-testid="alert"][data-kind="overdue"]');
  await expect(overdue).toContainText("Payment of £2,500");
  await overdue.getByRole("button", { name: "Mark paid" }).click();
  await expect(overdue).toHaveCount(0);
  await expect(page.getByTestId("deal")).toContainText("Paid");

  // 4. "Can I take this deal?"
  const checker = page.getByTestId("deal-checker");
  await checker.getByLabel("Brand").fill("CeraVe");
  await checker.getByLabel("Offer category").selectOption("skincare");
  await checker.getByLabel("Offer start").fill("2026-11-01");
  await checker.getByLabel("Offer end").fill("2027-02-01");
  await checker.getByRole("button", { name: "Check" }).click();
  await expect(checker.getByTestId("checker-result")).toContainText("Clashes with your Glow Serum");
  await expect(checker.getByTestId("checker-result")).toContainText("1 Nov 2026 to 31 Dec 2026");

  await checker.getByLabel("Offer category").selectOption("haircare");
  await checker.getByRole("button", { name: "Check" }).click();
  await expect(checker.getByTestId("checker-result")).toContainText("No clashes found");

  // 5. Calendar export.
  const ics = await page.request.get("/api/rights/calendar.ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("DTSTART;VALUE=DATE:20260618"); // whitelisting end
  expect(body).not.toContain("Payment due"); // it's been marked paid
});
