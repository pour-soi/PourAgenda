import { expect, test } from "@playwright/test";
import { physicalDragByPixels, physicalResize } from "./pointer-fixtures";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(120_000);

test("recurring pointer changes persist per occurrence and roll back on failure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Physical recurring gestures run once in desktop Chromium.");
  const client = await liveClient();
  await client.from("appointments").delete().like("title", "Recurring pointer %");
  const title = `Recurring pointer ${Date.now()}`;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + (((8 - start.getUTCDay()) % 7) || 7));
  start.setUTCHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const parent = await createLiveAppointment(client, title, {
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    intended_local_start: start.toISOString().slice(0, 19).replace("T", " "),
    intended_local_end: end.toISOString().slice(0, 19).replace("T", " "),
    recurrence_frequency: "daily", recurrence_interval: 1,
    recurrence_until: new Date(start.getTime() + 4 * 864e5).toISOString().slice(0, 10),
  });
  let failNext = false;
  await page.route("**/rest/v1/appointments*", async (route) => {
    if (failNext && route.request().method() === "PATCH") {
      failNext = false;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "forced recurrence failure" }) });
    } else await route.continue();
  });
  try {
    await page.addInitScript(() => { window.confirm = () => true; });
    await loginPage(page);
    await page.waitForFunction(() => Boolean(window.__pourAgendaCalendar));
    await page.evaluate((date) => window.__pourAgendaCalendar?.gotoDate(date), parent.starts_at);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    const occurrences = page.locator(`[data-appointment-id^="${parent.id}:"]`);
    const target = occurrences.first();
    await expect(target).toBeVisible();
    const originalId = await target.getAttribute("data-appointment-id");
    const siblingId = await occurrences.nth(1).getAttribute("data-appointment-id");

    await physicalDragByPixels(target, 48);
    await expect.poll(async () =>
      (await client.from("appointments").select("*").eq("series_id", parent.id)).data?.length,
    ).toBe(1);
    let exception = (await client.from("appointments").select("*").eq("series_id", parent.id).single()).data!;
    expect(exception.starts_at).not.toBe(exception.original_occurrence_start);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__pourAgendaCalendar));
    await page.evaluate((date) => window.__pourAgendaCalendar?.gotoDate(date), parent.starts_at);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.locator(`[data-appointment-id="${originalId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-appointment-id="${siblingId}"]`)).toHaveCount(1);

    const moved = page.locator(`[data-appointment-id="${originalId}"]`);
    const beforeResize = Date.parse(exception.ends_at) - Date.parse(exception.starts_at);
    await physicalResize(page, moved);
    await expect.poll(async () => {
      const row = (await client.from("appointments").select("*").eq("id", exception.id).single()).data;
      return row ? Date.parse(row.ends_at) - Date.parse(row.starts_at) : beforeResize;
    }).not.toBe(beforeResize);
    exception = (await client.from("appointments").select("*").eq("id", exception.id).single()).data!;

    failNext = true;
    await physicalDragByPixels(moved, 48);
    await expect(page.getByText("PourAgenda could not save that appointment. Check your connection and try again.")).toBeVisible();
    expect((await client.from("appointments").select("starts_at,ends_at").eq("id", exception.id).single()).data)
      .toMatchObject({ starts_at: exception.starts_at, ends_at: exception.ends_at });

    failNext = true;
    await physicalResize(page, page.locator(`[data-appointment-id="${originalId}"]`));
    await expect(page.getByText("PourAgenda could not save that appointment. Check your connection and try again.")).toBeVisible();
    expect((await client.from("appointments").select("starts_at,ends_at").eq("id", exception.id).single()).data)
      .toMatchObject({ starts_at: exception.starts_at, ends_at: exception.ends_at });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__pourAgendaCalendar));
    await page.evaluate((date) => window.__pourAgendaCalendar?.gotoDate(date), parent.starts_at);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.locator(`[data-appointment-id="${originalId}"]`)).toHaveCount(1);
  } finally {
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
  }
});

test("single occurrence removal stays scoped", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Series destructive flow runs once in desktop Chromium.");
  const client = await liveClient();
  await client.from("appointments").delete().like("title", "Recurring destructive %");
  await client.from("appointments").delete().like("title", "Recurring unrelated %");
  const title = `Recurring destructive ${Date.now()}`;
  const unrelatedTitle = `Recurring unrelated ${Date.now()}`;
  const parent = await createLiveAppointment(client, title, {
    recurrence_frequency: "daily", recurrence_interval: 1,
    recurrence_until: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10),
  });
  const unrelatedStart = new Date(Date.now() + 10 * 864e5);
  unrelatedStart.setUTCHours(12, 0, 0, 0);
  const unrelated = await createLiveAppointment(client, unrelatedTitle, {
    starts_at: unrelatedStart.toISOString(),
    ends_at: new Date(unrelatedStart.getTime() + 3600_000).toISOString(),
  });
  try {
    await loginPage(page);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    const occurrences = page.locator(`[data-appointment-id^="${parent.id}:"]`);
    await expect(occurrences.first()).toBeVisible();
    await occurrences.first().scrollIntoViewIfNeeded();
    page.once("dialog", (dialog) => dialog.accept());
    await occurrences.first().click({ force: true });
    await expect(page.getByRole("dialog").getByText("Editing this occurrence only")).toBeVisible();
    page.once("dialog", (confirmation) => confirmation.accept());
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect((await client.from("appointments").select("status").eq("id", parent.id).single()).data?.status).toBe("pending");
    await expect.poll(async () =>
      (await client.from("appointments").select("series_id,status").eq("series_id", parent.id)).data,
    ).toContainEqual({ series_id: parent.id, status: "cancelled" });

    expect((await client.from("appointments").select("id").eq("id", parent.id)).data).toHaveLength(1);
    expect((await client.from("appointments").select("id").eq("id", unrelated.id)).data).toHaveLength(1);
  } finally {
    await client.from("appointments").delete().in("id", [parent.id, unrelated.id]);
    await client.auth.signOut();
  }
});
