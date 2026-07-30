import { expect, test, type Page } from "@playwright/test";
import { liveClient, localInput, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(90_000);

async function createSeries(
  page: Page,
  title: string,
  pattern: "weekly" | "monthly" | "weekly-n",
  ending: "date" | "never",
) {
  await page.getByRole("button", { name: "New appointment" }).last().click();
  const dialog = page.getByRole("dialog");
  const start = new Date(Date.now() + 864e5);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Start").fill(localInput(start.toISOString()));
  await dialog.getByRole("textbox", { name: "End", exact: true }).fill(localInput(end.toISOString()));
  await dialog.getByLabel("Repeat pattern").selectOption(pattern);
  if (pattern === "weekly-n") await dialog.getByLabel("Repeat every weeks").fill("2");
  await dialog.getByLabel("Repeat ending").selectOption(ending);
  if (ending === "date") {
    const until = new Date(start);
    until.setDate(until.getDate() + (pattern === "monthly" ? 70 : 28));
    await dialog.getByLabel("Repeat end date").fill(until.toISOString().slice(0, 10));
  }
  const expected = pattern === "monthly" ? "Monthly" : pattern === "weekly-n" ? "Every 2 weeks" : "Weekly";
  await expect(dialog.getByText(new RegExp(`${expected}.*${ending === "never" ? "never ends" : "until"}`))).toBeVisible();
  await dialog.getByRole("button", { name: "Save appointment" }).click();
  await expect(dialog).toBeHidden();
}

for (const scenario of [
  { name: "weekly recurrence with an end date", pattern: "weekly" as const, ending: "date" as const },
  { name: "monthly recurrence with an end date", pattern: "monthly" as const, ending: "date" as const },
  { name: "every-N-weeks recurrence with an end date", pattern: "weekly-n" as const, ending: "date" as const },
  { name: "never-ending weekly recurrence remains bounded", pattern: "weekly" as const, ending: "never" as const },
]) {
  test(scenario.name, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Creation persistence runs once in desktop Chromium.");
    const client = await liveClient();
    const title = `Recurring creation ${scenario.pattern} ${scenario.ending} ${Date.now()}`;
    try {
      await loginPage(page);
      await createSeries(page, title, scenario.pattern, scenario.ending);
      const parent = await expect.poll(async () =>
        (await client.from("appointments").select("*").eq("title", title).is("series_id", null).maybeSingle()).data,
      ).not.toBeNull();
      const row = (await client.from("appointments").select("*").eq("title", title).single()).data!;
      expect(row.recurrence_frequency).toBe(scenario.pattern === "weekly-n" ? "weekly" : scenario.pattern);
      expect(row.recurrence_interval).toBe(scenario.pattern === "weekly-n" ? 2 : 1);
      expect(Boolean(row.recurrence_until)).toBe(scenario.ending === "date");
      await page.reload();
      await page.getByRole("button", { name: "Week", exact: true }).click();
      const occurrences = page.locator(`[data-appointment-id^="${row.id}:"]`);
      await expect(occurrences.first()).toBeVisible();
      expect(await occurrences.count()).toBeLessThan(20);
      void parent;
    } finally {
      await client.from("appointments").delete().eq("title", title);
      await client.auth.signOut();
    }
  });
}
