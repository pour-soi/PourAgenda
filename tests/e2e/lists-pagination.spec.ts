import { expect, test } from "@playwright/test";
import { cleanupTitles, createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(90_000);

test("appointment lists paginate without duplicates and reset on filters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One live pagination run is sufficient.");
  const client = await liveClient();
  const prefix = `Pagination ${Date.now()}`;
  const titles = Array.from({ length: 21 }, (_, index) => `${prefix} ${String(index).padStart(2, "0")}`);
  try {
    for (let index = 0; index < titles.length; index += 1) {
      await createLiveAppointment(client, titles[index], {
        starts_at: new Date(Date.now() + (index + 2) * 3600_000).toISOString(),
        ends_at: new Date(Date.now() + (index + 3) * 3600_000).toISOString(),
      });
    }
    await loginPage(page);
    await page.getByRole("button", { name: "Appointment lists" }).click();
    await page.getByLabel("Search appointments").fill(prefix);
    await page.waitForTimeout(400);
    const list = page.getByRole("region", { name: "Upcoming appointments" });
    const records = list.getByRole("button").filter({ hasText: prefix });
    await expect(records).toHaveCount(20);
    await list.getByRole("button", { name: "Load more" }).click();
    await expect(records).toHaveCount(21);
    await expect(list.getByText("End of list.")).toBeVisible();
    const names = await records.allTextContents();
    expect(new Set(names).size).toBe(21);
    await page.getByLabel("Search appointments").fill(`${prefix} 0`);
    await page.waitForTimeout(400);
    await page.getByLabel("Search appointments").fill(prefix);
    await page.waitForTimeout(400);
    await expect(records).toHaveCount(20);
    await expect(list.getByRole("button", { name: "Load more" })).toBeVisible();
  } finally {
    await cleanupTitles(client, titles);
  }
});
