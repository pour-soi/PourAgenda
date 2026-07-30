import { expect, test } from "@playwright/test";
import { loginPage } from "./live-fixtures";

test.use({ trace: "off" });

test("mobile filters, navigation, form, and safe layout remain usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"), "Mobile viewport coverage.");
  await loginPage(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  const filters = page.getByRole("dialog", { name: "Appointment filters" });
  await filters.getByLabel("Category filter").selectOption({ index: 1 });
  await filters.getByLabel("Search appointments").fill("verification");
  await expect(page.getByRole("button", { name: /Filters, 2 active/ })).toBeVisible();
  await filters.getByRole("button", { name: "Clear all" }).click();
  await filters.getByRole("button", { name: "Show results" }).click();
  await page.getByRole("button", { name: "New appointment" }).click();
  const form = page.getByRole("dialog", { name: "Create appointment" });
  await form.getByLabel("Title").fill("Keyboard-safe draft");
  await expect(form.getByRole("button", { name: "Save appointment" })).toBeVisible();
  await form.getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
