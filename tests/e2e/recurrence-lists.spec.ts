import { expect, test } from "@playwright/test";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(120_000);

const localStamp = (iso: string) => iso.slice(0, 19).replace("T", " ");

test("recurring sections, search, and pagination stay deterministic", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The complete recurring list flow runs once in desktop Chromium.");
  const client = await liveClient();
  const prefix = `Recurring lists ${Date.now()}`;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 30 * 60_000);
  const until = new Date(start.getTime() + 24 * 864e5).toISOString().slice(0, 10);
  const parents: string[] = [];
  try {
    const active = await createLiveAppointment(client, `${prefix} active`, {
      starts_at: start.toISOString(), ends_at: end.toISOString(),
      intended_local_start: localStamp(start.toISOString()), intended_local_end: localStamp(end.toISOString()),
      recurrence_frequency: "daily", recurrence_interval: 1, recurrence_until: until,
    });
    parents.push(active.id);
    const modifiedStart = new Date(start.getTime() + 864e5 + 2 * 3600_000);
    const modifiedEnd = new Date(modifiedStart.getTime() + 30 * 60_000);
    await createLiveAppointment(client, `${prefix} modified`, {
      starts_at: modifiedStart.toISOString(), ends_at: modifiedEnd.toISOString(),
      intended_local_start: localStamp(modifiedStart.toISOString()), intended_local_end: localStamp(modifiedEnd.toISOString()),
      series_id: active.id, original_occurrence_start: new Date(start.getTime() + 864e5).toISOString(),
    });
    await createLiveAppointment(client, `${prefix} cancelled exception`, {
      starts_at: new Date(start.getTime() + 2 * 864e5).toISOString(),
      ends_at: new Date(end.getTime() + 2 * 864e5).toISOString(),
      series_id: active.id, original_occurrence_start: new Date(start.getTime() + 2 * 864e5).toISOString(),
      status: "cancelled", cancelled_at: new Date().toISOString(),
    });
    for (const { suffix, ...state } of [
      { suffix: "completed", status: "completed", archived: false, completed_at: new Date().toISOString() },
      { suffix: "cancelled", status: "cancelled", archived: false, cancelled_at: new Date().toISOString() },
      { suffix: "archived", status: "pending", archived: true },
    ]) {
      const row = await createLiveAppointment(client, `${prefix} ${suffix}`, {
        starts_at: start.toISOString(), ends_at: end.toISOString(),
        intended_local_start: localStamp(start.toISOString()), intended_local_end: localStamp(end.toISOString()),
        recurrence_frequency: "daily", recurrence_interval: 1, recurrence_until: until, ...state,
      });
      parents.push(row.id);
    }

    await loginPage(page);
    await page.getByRole("button", { name: "Appointment lists" }).click();
    const search = page.getByLabel("Search appointments");
    await search.fill(`${prefix} active`);
    await page.waitForTimeout(400);
    let list = page.getByRole("region", { name: "Upcoming appointments" });
    const activeRows = list.getByRole("button").filter({ hasText: `${prefix} active` });
    await expect(activeRows).toHaveCount(20);
    await list.getByRole("button", { name: "Load more" }).click();
    await expect(activeRows).toHaveCount(23);
    await expect(list.getByText("End of list.")).toBeVisible();
    const labels = await activeRows.allTextContents();
    expect(new Set(labels).size).toBe(23);

    await search.fill(`${prefix} modified`);
    await page.waitForTimeout(400);
    await expect(list.getByText(`${prefix} modified`, { exact: true })).toHaveCount(1);
    await search.fill(`${prefix} cancelled exception`);
    await page.waitForTimeout(400);
    await expect(list.getByText("No appointments match your search.")).toBeVisible();

    await search.fill(`${prefix} active`);
    await page.getByRole("tab", { name: "Today" }).click();
    list = page.getByRole("region", { name: "Today appointments" });
    await expect(list.getByText(`${prefix} active`, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "This week" }).click();
    await expect(page.getByRole("region", { name: "This week appointments" })
      .getByText(`${prefix} active`, { exact: true }).first()).toBeVisible();

    await expect(page.getByRole("tab", { name: "Completed" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Cancelled" })).toHaveCount(0);
    await search.fill(`${prefix} archived`);
    await page.getByRole("tab", { name: "Archived" }).click();
    await expect(page.getByRole("region", { name: "Archived appointments" })
      .getByText(`${prefix} archived`, { exact: true }).first()).toBeVisible();
  } finally {
    for (const id of parents) await client.from("appointments").delete().eq("id", id);
    await client.auth.signOut();
  }
});
