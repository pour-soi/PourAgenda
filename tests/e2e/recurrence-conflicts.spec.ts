import { expect, test, type Page } from "@playwright/test";
import { localInputToUtc, toLocalInput } from "../../src/lib/appointments";
import { createLiveAppointment, liveClient, localInput, loginPage } from "./live-fixtures";
import { fillDateTimePicker } from "./date-time-picker-fixtures";

test.use({ trace: "off" });
test.setTimeout(120_000);

async function fillAppointment(page: Page, title: string, start: Date, end: Date, timezone?: string) {
  await page.getByRole("button", { name: "New appointment" }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await fillDateTimePicker(dialog.getByLabel("Start"), timezone ? toLocalInput(start.toISOString(), timezone) : localInput(start.toISOString()));
  await fillDateTimePicker(dialog.getByRole("textbox", { name: "End", exact: true }),
    timezone ? toLocalInput(end.toISOString(), timezone) : localInput(end.toISOString()));
  return dialog;
}

const intended = (value: Date) => value.toISOString().slice(0, 19).replace("T", " ");

test("one-time appointments detect generated recurring conflicts and Save anyway is explicit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Recurring conflict matrix runs once in desktop Chromium.");
  const client = await liveClient();
  const prefix = `Recurring conflict one-time ${Date.now()}`;
  const start = new Date(Date.now() + 40 * 864e5);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const parent = await createLiveAppointment(client, `${prefix} series`, {
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    intended_local_start: intended(start), intended_local_end: intended(end),
    recurrence_frequency: "daily", recurrence_interval: 1,
    recurrence_until: new Date(start.getTime() + 2 * 864e5).toISOString().slice(0, 10),
  });
  try {
    const timezone = (await client.from("user_settings").select("timezone").single()).data!.timezone;
    await loginPage(page);
    const conflictStart = new Date(start.getTime() + 864e5);
    const dialog = await fillAppointment(page, `${prefix} candidate`, conflictStart,
      new Date(conflictStart.getTime() + 3600_000), timezone);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog.getByText("Time conflict")).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${prefix} series`))).toBeVisible();
    await dialog.getByRole("button", { name: "Save anyway" }).click();
    await expect(dialog).toBeHidden();
    expect((await client.from("appointments").select("id").eq("title", `${prefix} candidate`)).data).toHaveLength(1);
  } finally {
    await client.from("appointments").delete().like("title", `${prefix}%`);
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
  }
});

test("new recurring series detects one-time and recurring conflicts caused by later occurrences", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Recurring conflict matrix runs once in desktop Chromium.");
  const client = await liveClient();
  const prefix = `Recurring conflict series ${Date.now()}`;
  const start = new Date(Date.now() + 80 * 864e5);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const timezone = (await client.from("user_settings").select("timezone").single()).data!.timezone;
  const actualStart = new Date(localInputToUtc(localInput(start.toISOString()), timezone));
  const actualEnd = new Date(localInputToUtc(localInput(end.toISOString()), timezone));
  const later = new Date(actualStart);
  const oneTime = await createLiveAppointment(client, `${prefix} one-time`, {
    starts_at: new Date(later.getTime() - 12 * 3600_000).toISOString(),
    ends_at: new Date(actualEnd.getTime() + 12 * 3600_000).toISOString(),
  });
  const recurring = await createLiveAppointment(client, `${prefix} existing series`, {
    starts_at: new Date(actualStart.getTime() - 12 * 3600_000).toISOString(),
    ends_at: new Date(actualEnd.getTime() + 12 * 3600_000).toISOString(),
    intended_local_start: localInput(start.toISOString()).replace("T", " "),
    intended_local_end: localInput(end.toISOString()).replace("T", " "),
    timezone,
    recurrence_frequency: "weekly", recurrence_interval: 1,
    recurrence_until: new Date(start.getTime() + 21 * 864e5).toISOString().slice(0, 10),
  });
  try {
    await loginPage(page);
    const dialog = await fillAppointment(page, `${prefix} candidate series`, start, end);
    await dialog.getByLabel("Repeat pattern").selectOption("weekly");
    await dialog.getByLabel("Repeat ending").selectOption("date");
    await fillDateTimePicker(dialog.getByLabel("Repeat end date"), new Date(start.getTime() + 14 * 864e5).toISOString().slice(0, 10));
    await expect(dialog.getByText(/Weekly until/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog.getByText("Time conflict")).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${prefix} one-time`))).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${prefix} existing series`)).first()).toBeVisible();
  } finally {
    await client.from("appointments").delete().like("title", `${prefix}%`);
    await client.from("appointments").delete().in("id", [oneTime.id, recurring.id]);
    await client.auth.signOut();
  }
});

test("cancelled exceptions are ignored, modified exceptions conflict, and adjacency is allowed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Recurring conflict matrix runs once in desktop Chromium.");
  const client = await liveClient();
  const prefix = `Recurring conflict exceptions ${Date.now()}`;
  const start = new Date(Date.now() + 120 * 864e5);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const parent = await createLiveAppointment(client, `${prefix} series`, {
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    intended_local_start: intended(start), intended_local_end: intended(end),
    recurrence_frequency: "daily", recurrence_interval: 1,
    recurrence_until: new Date(start.getTime() + 2 * 864e5).toISOString().slice(0, 10),
  });
  const movedStart = new Date(start.getTime() + 864e5 + 2 * 3600_000);
  const movedEnd = new Date(movedStart.getTime() + 3600_000);
  await createLiveAppointment(client, `${prefix} cancelled`, {
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    series_id: parent.id, original_occurrence_start: start.toISOString(),
    status: "cancelled", cancelled_at: new Date().toISOString(),
  });
  await createLiveAppointment(client, `${prefix} modified`, {
    starts_at: movedStart.toISOString(), ends_at: movedEnd.toISOString(),
    series_id: parent.id, original_occurrence_start: new Date(start.getTime() + 864e5).toISOString(),
  });
  try {
    const timezone = (await client.from("user_settings").select("timezone").single()).data!.timezone;
    await loginPage(page);
    let dialog = await fillAppointment(page, `${prefix} ignored candidate`, start, end, timezone);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog).toBeHidden();

    dialog = await fillAppointment(page, `${prefix} modified candidate`, movedStart, movedEnd, timezone);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog.getByText("Time conflict")).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${prefix} modified`))).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    dialog = await fillAppointment(page, `${prefix} adjacent candidate`, movedEnd,
      new Date(movedEnd.getTime() + 3600_000), timezone);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await client.from("appointments").delete().like("title", `${prefix}%`);
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
  }
});
