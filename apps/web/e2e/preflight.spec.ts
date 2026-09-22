import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const ANALYSIS_TIMEOUT = 150_000;

const BRIEF =
  "Talking points: say you use it every morning; tell viewers to tap the link. Do not mention competitor brands.";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("upload → report → overlay → share → re-check", async ({ page, browser }) => {
  // 1. Upload v1 with a brief and a caption without #ad.
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Check a draft" }).click();

  await page.getByLabel("Draft video").setInputFiles(fixture("draft-v1.mp4"));
  await page.getByRole("radio", { name: "TikTok" }).check({ force: true });
  await page.getByText("Brief, caption and brand (optional)").click();
  await page.getByLabel("Brand name").fill("Glow Serum");
  await page.getByLabel("Brand brief").fill(BRIEF);
  await page.getByLabel("Planned caption").fill("my morning routine");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Run preflight" }).click();

  // 2. Live progress, then the report.
  await expect(page).toHaveURL(/\/preflight\/[0-9a-f-]{36}$/);
  const reportUrl = page.url();
  await expect(page.getByTestId("score")).toBeVisible({ timeout: ANALYSIS_TIMEOUT });
  await expect(page.getByTestId("verdict")).toHaveText("Not ready"); // disclosure fail caps at 49
  await expectNoHorizontalScroll(page);

  // Deterministic checks with evidence.
  const safeZone = page.locator('[data-check-id="read.safe_zone"]');
  await expect(safeZone).toHaveAttribute("data-status", "fail");
  await expect(safeZone).toContainText("TAP THE LINK");
  await expect(page.locator('[data-check-id="comp.disclosure"]')).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("fix-item").first()).toBeVisible();

  // 3. Marker seeks the video; overlay flags the text in the caption area.
  await page.getByTestId("overlay-toggle").click();
  await expect(page.getByTestId("safe-zone-overlay")).toBeVisible();
  await page.getByRole("button", { name: /Text is hidden behind TikTok's caption area at/ }).click();
  await expect(page.getByTestId("current-time")).toContainText("6.");
  await expect(page.locator('[data-testid="safe-zone-overlay"] rect[data-unsafe="true"]')).toHaveCount(1);

  // 4. Share link opens read-only for someone without a session.
  await page.getByTestId("share").click();
  const shareUrl = await page.getByTestId("share-url").inputValue();
  expect(shareUrl).toMatch(/\/r\/[\w-]{16,}$/);
  const stranger = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const shared = await stranger.newPage();
  await shared.goto(shareUrl);
  await expect(shared.getByTestId("shared-badge")).toBeVisible();
  await expect(shared.getByTestId("score")).toBeVisible();
  await expect(shared.getByTestId("share")).toHaveCount(0);
  await expect(shared.getByTestId("recheck")).toHaveCount(0);
  const ownerPage = await shared.goto(reportUrl);
  expect(ownerPage?.status()).toBe(404);
  await stranger.close();

  // 5. Re-check with the fixed v2: brief is kept, caption gets #ad.
  await page.getByTestId("recheck").click();
  await expect(page.getByRole("heading", { name: "Re-check your draft" })).toBeVisible();
  await expect(page.getByLabel("Brand name")).toHaveValue("Glow Serum");
  await expect(page.getByLabel("Brand brief")).toHaveValue(BRIEF);
  await page.getByLabel("Draft video").setInputFiles(fixture("draft-v2.mp4"));
  await page.getByLabel("Planned caption").fill("#ad my morning routine");
  await page.getByRole("button", { name: "Run preflight" }).click();

  await expect(page.getByTestId("recheck-diff")).toBeVisible({ timeout: ANALYSIS_TIMEOUT });
  await expect(page.getByTestId("diff-summary")).toContainText("fixed");
  await expect(page.locator('[data-check-id="read.safe_zone"]')).toHaveAttribute("data-status", "pass");
  await expect(page.locator('[data-check-id="comp.disclosure"]')).toHaveAttribute("data-status", "pass");
  await expectNoHorizontalScroll(page);
});
