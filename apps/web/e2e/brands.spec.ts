import path from "node:path";

import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test("import posts → ranked brands → past partners → grounded pitch", async ({ page }) => {
  await page.goto("/brands");
  await expect(page.getByRole("heading", { name: "Brands you already love" })).toBeVisible();

  // Profile without followers: the pitch must not mention any.
  await page.getByTestId("profile-card").locator("summary").click();
  await page.getByPlaceholder("@you").fill("@maya");
  await page.getByPlaceholder("e.g. honest skincare routines").fill("honest skincare routines");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  // Import the CSV (8 posts, 2 sponsored Glow Serum posts).
  await page.getByRole("tab", { name: "CSV file" }).click();
  await page.getByLabel("Posts CSV").setInputFiles(fixture("posts.csv"));
  await page.getByRole("button", { name: "Import and find brands" }).click();
  await expect(page.getByTestId("import-message")).toContainText("8 new posts imported");

  // Ranked brands appear once the scan finishes.
  const cards = page.getByTestId("brand-card");
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });
  await expect(cards.first()).toHaveAttribute("data-brand", "The Ordinary");
  await expect(cards.first()).toContainText("2 organic mentions");
  await expect(page.locator('[data-brand="Glossier"]')).toContainText("not a fan here");
  await expect(page.getByTestId("past-partners")).toContainText("Glow Serum");
  await expect(page.locator('[data-brand="Glow Serum"]')).toHaveCount(0);

  // Re-importing the same CSV adds nothing.
  await page.getByTestId("import-panel").locator("summary").click();
  await page.getByRole("tab", { name: "CSV file" }).click();
  await page.getByLabel("Posts CSV").setInputFiles(fixture("posts.csv"));
  await page.getByRole("button", { name: "Import and find brands" }).click();
  await expect(page.getByTestId("import-message")).toContainText("0 new posts imported, 8 already here");

  // Draft a pitch for the top brand.
  const top = cards.first();
  await top.getByTestId("draft-pitch").click();
  await top.getByText("Gifting").click();
  await top.getByTestId("draft-submit").click();
  const body = top.getByTestId("pitch-body");
  await expect(body).toBeVisible({ timeout: 60_000 });
  const text = await body.inputValue();
  expect(text.split(/\s+/).length).toBeLessThan(150);
  expect(text).not.toMatch(/\d[\d,.]*\s*k?\s*followers/i);
  const evidence = top.getByTestId("pitch-evidence");
  await expect(evidence).toContainText("5am routine");
  await expect(evidence.getByRole("link").first()).toHaveAttribute("href", /tiktok\.com/);
  await expect(top).toContainText("Greenlight never sends anything");
});
