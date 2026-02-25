import { expect, test } from "@playwright/test";

test("loads footprint page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("TrailDB")).toBeVisible();
  await expect(page.getByRole("heading", { name: "旅行足迹", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "中国" })).toBeVisible();
});
