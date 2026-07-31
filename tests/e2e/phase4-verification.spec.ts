import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(90_000);

test("unsupported notification browsers receive accurate guidance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Capability-state verification runs once in desktop Chromium.");
  await page.addInitScript(() => { delete (window as Window & { Notification?: typeof Notification }).Notification; });
  await loginPage(page);
  await page.goto("/settings");
  await expect(page.getByText(/notification permission/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Enable browser notifications" }).click();
  await expect(page.getByText("This browser does not support notifications.")).toBeVisible();
});

test("reminder preferences and appointment overrides persist with real permission states", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Live reminder mutation runs once in desktop Chromium.");
  const client = await liveClient("A");
  const original = (await client.from("user_settings").select("default_reminder_minutes").single()).data!;
  const title = `Reminder verification ${Date.now()}`;
  try {
    await loginPage(page);
    await page.goto("/settings");
    await page.getByLabel("At start time").check();
    await page.getByLabel("10 minutes before").check();
    await page.getByLabel("1 day before").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("At start time")).toBeChecked();
    await expect(page.getByLabel("10 minutes before")).toBeChecked();
    await expect(page.getByLabel("1 day before")).toBeChecked();

    const appointment = await createLiveAppointment(client, title, { reminder_minutes: [0, 10, 30, 60, 1440] });
    await page.goto("/");
    await page.getByText(title, { exact: true }).first().click();
    for (const label of ["Reminder when event begins", "Reminder 10 minutes before", "Reminder 30 minutes before", "Reminder 1 hour before", "Reminder 1 day before"]) {
      await expect(page.getByRole("dialog").getByLabel(label)).toBeChecked();
    }
    await page.getByRole("button", { name: "Close" }).click();
    expect((await client.from("appointments").select("reminder_minutes").eq("id", appointment.id).single()).data?.reminder_minutes)
      .toEqual([0, 10, 30, 60, 1440]);

    await page.goto("/settings");
    expect(await page.evaluate(() => Notification.permission)).toBe("denied");
    await page.getByRole("button", { name: "Enable browser notifications" }).click();
    await expect(page.getByText("Notification permission is default.")).toBeVisible();
    await context.grantPermissions(["notifications"], { origin: new URL(page.url()).origin });
    await page.reload();
    await page.getByRole("button", { name: "Enable browser notifications" }).click();
    await expect(page.getByText("Browser notifications enabled. Delivery remains best effort.")).toBeVisible();
    const nearStart = new Date(Date.now() + 4_000), nearEnd = new Date(nearStart.getTime() + 3_600_000);
    await client.from("appointments").update({ starts_at: nearStart.toISOString(), ends_at: nearEnd.toISOString(), reminder_minutes: [0] }).eq("id", appointment.id);
    await page.goto("/");
    await expect(page.getByText(new RegExp(`Reminder: ${title}`))).toBeVisible({ timeout: 10_000 });
    const delivered = await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("pouragenda-reminder:")).length);
    expect(delivered).toBe(1);
    await page.reload();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("pouragenda-reminder:")).length)).toBe(1);
  } finally {
    await client.from("appointments").delete().eq("title", title);
    await client.from("user_settings").update({ default_reminder_minutes: original.default_reminder_minutes }).select();
    await client.from("appointment_activity").delete().in("action", ["reminder_changed"]);
    await client.auth.signOut();
  }
});

test("category delete preserves linked appointments with replacement selection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One live category reassignment flow is sufficient in desktop Chromium.");
  const client = await liveClient("A");
  const marker = `Category delete ${Date.now()}`;
  const userId = (await client.auth.getUser()).data.user!.id;
  const unusedName = `${marker} Unused`;
  const sourceName = `${marker} Source`;
  const appointmentTitle = `${marker} Appointment`;
  const [unused, source, replacement] = await Promise.all([
    client.from("categories").insert({ user_id: userId, name: unusedName, color: "#667168", hidden: false }).select("id,name").single(),
    client.from("categories").insert({ user_id: userId, name: sourceName, color: "#2F6959", hidden: false }).select("id,name").single(),
    client.from("categories").insert({ user_id: userId, name: `${marker} Replacement`, color: "#A26068", hidden: false }).select("id,name").single(),
  ]);
  if (unused.error || source.error || replacement.error || !unused.data || !source.data || !replacement.data) {
    await Promise.all([
      client.from("categories").delete().eq("user_id", userId).like("name", `${marker}%`),
      client.auth.signOut(),
    ]);
    throw new Error("Live category setup failed.");
  }
  const appointment = await createLiveAppointment(client, appointmentTitle, { category_id: source.data.id });
  let rpcRequests = 0;
  let releaseFirstRequest = false;
  await page.route("**/rest/v1/rpc/move_category_appointments_and_delete", async (route) => {
    rpcRequests += 1;
    if (rpcRequests === 1) {
      while (!releaseFirstRequest) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    await route.continue();
  });

  try {
    await loginPage(page);
    await page.goto("/settings");
    const unusedDelete = page.getByRole("button", { name: `Delete ${unusedName}` });
    await expect(unusedDelete).toBeVisible();
    await unusedDelete.click();
    await expect(page.getByRole("dialog", { name: `Delete category "${unusedName}"` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Delete ${unusedName}` })).toHaveCount(0);

    const sourceDelete = page.getByRole("button", { name: `Delete ${sourceName}` });
    await sourceDelete.click();
    const dialog = page.getByRole("dialog", { name: `Delete category "${sourceName}"` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`This category is currently used by 1 appointments.`)).toBeVisible();
    const replacementOptions = await dialog.getByRole("combobox", { name: /replacement category/i }).locator("option").allTextContents();
    expect(replacementOptions).not.toContain(sourceName);
    await dialog.getByRole("combobox", { name: /replacement category/i }).selectOption({ label: replacement.data.name });
    const moveDelete = dialog.getByRole("button", { name: "Move & Delete" });
    await moveDelete.click();
    await expect(moveDelete).toBeDisabled();
    await expect.poll(() => rpcRequests).toBe(1);
    const requestsAfterClick = rpcRequests;
    await moveDelete.click({ force: true }).catch(() => null);
    expect(rpcRequests).toBe(requestsAfterClick);
    releaseFirstRequest = true;
    await expect.poll(() => rpcRequests).toBe(1);
    expect(rpcRequests).toBe(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: `Delete ${sourceName}` })).toHaveCount(0);

    const appointmentRow = await client.from("appointments").select("category_id").eq("id", appointment.id).single();
    expect(appointmentRow.data?.category_id).toBe(replacement.data.id);
    const sourceCategory = await client.from("categories").select("id").eq("id", source.data.id).maybeSingle();
    expect(sourceCategory.data).toBeNull();
    await page.goto("/");
    await expect(page.getByText(appointmentTitle, { exact: true }).first()).toBeVisible();
    await expect(rpcRequests).toBe(1);
    await page.goto("/settings");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: `Delete ${sourceName}` })).toHaveCount(0);

  } finally {
    await page.unroute("**/rest/v1/rpc/move_category_appointments_and_delete");
    await client.from("appointments").delete().eq("title", appointmentTitle);
    await client.from("categories").delete().like("name", `${marker}%`);
    await client.auth.signOut();
  }
});

test("atomic category replacement move fails safely when replacement category is invalid", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "RPC atomicity verification runs once in desktop Chromium.");
  const client = await liveClient("A");
  const marker = `Category atomic ${Date.now()}`;
  const userId = (await client.auth.getUser()).data.user!.id;
  const [sourceCategory, replacementCategory] = await Promise.all([
    client.from("categories").insert({ user_id: userId, name: `${marker} Source`, color: "#8B5CF6", hidden: false }).select("id").single(),
    client.from("categories").insert({ user_id: userId, name: `${marker} Replacement`, color: "#10B981", hidden: false }).select("id").single(),
  ]);
  if (!sourceCategory.data || sourceCategory.error || !replacementCategory.data || replacementCategory.error) {
    await client.from("categories").delete().like("name", `${marker}%`);
    await client.auth.signOut();
    throw new Error("Atomic test category setup failed.");
  }

  const appointment = await createLiveAppointment(client, `${marker} Appointment`, { category_id: sourceCategory.data.id });
  const replacementMissing = crypto.randomUUID();
  try {
    const result = await client.rpc("move_category_appointments_and_delete", {
      source_category_id: sourceCategory.data.id,
      replacement_category_id: replacementMissing,
    });
    expect(result.error).toBeTruthy();

    const sourceAppointment = await client.from("appointments").select("category_id").eq("id", appointment.id).single();
    expect(sourceAppointment.data?.category_id).toBe(sourceCategory.data.id);
    const sourceStillExists = await client.from("categories").select("id").eq("id", sourceCategory.data.id).single();
    expect(sourceStillExists.data).toBeTruthy();
    const replacementStillExists = await client.from("categories").select("id").eq("id", replacementCategory.data.id).single();
    expect(replacementStillExists.data).toBeTruthy();
  } finally {
    await Promise.all([
      client.from("appointments").delete().eq("id", appointment.id),
      client.from("categories").delete().in("name", [`${marker} Source`, `${marker} Replacement`]),
    ]);
    await client.auth.signOut();
  }
});

test("live exports download owner data with safe CSV, JSON, and ICS", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Download verification runs once in desktop Chromium.");
  const a = await liveClient("A"), b = await liveClient("B");
  const marker = `Export ${Date.now()}`, foreign = `Foreign ${Date.now()}`;
  const aId = (await a.auth.getUser()).data.user!.id, bId = (await b.auth.getUser()).data.user!.id;
  const ownedAppointmentIds: string[] = [];
  try {
    const oneTime = await createLiveAppointment(a, marker, { title: marker, private_notes: "=PRIVATE,\"line\"\nsecret", public_notes: "Public export" });
    ownedAppointmentIds.push(oneTime.id);
    const recurring = await createLiveAppointment(a, `${marker} recurring`, {
      recurrence_frequency: "weekly", recurrence_interval: 1,
      recurrence_until: new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10),
    });
    ownedAppointmentIds.push(recurring.id);
    const originalStart = new Date(Date.parse(recurring.starts_at) + 7 * 864e5);
    await createLiveAppointment(a, `${marker} modified`, {
      series_id: recurring.id, original_occurrence_start: originalStart.toISOString(),
      starts_at: new Date(originalStart.getTime() + 3600e3).toISOString(),
      ends_at: new Date(originalStart.getTime() + 7200e3).toISOString(),
    });
    const cancelledStart = new Date(originalStart.getTime() + 7 * 864e5);
    await createLiveAppointment(a, `${marker} cancelled occurrence`, {
      series_id: recurring.id, original_occurrence_start: cancelledStart.toISOString(),
      starts_at: cancelledStart.toISOString(), ends_at: new Date(cancelledStart.getTime() + 3600e3).toISOString(),
      status: "cancelled", cancelled_at: new Date().toISOString(),
    });
    const completed = await createLiveAppointment(a, `${marker} completed`, {
      status: "completed", completed_at: new Date().toISOString(),
    });
    const archived = await createLiveAppointment(a, `${marker} archived`, { archived: true });
    ownedAppointmentIds.push(completed.id, archived.id);
    await createLiveAppointment(b, foreign);
    await a.from("contacts").insert({ user_id: aId, name: `=SUM(1), ${marker}`, notes: "line1\nline2" });
    await b.from("contacts").insert({ user_id: bId, name: foreign });
    await loginPage(page); await page.goto("/settings");
    const appointmentDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export appointments CSV" }).click();
    const appointment = await appointmentDownload;
    expect(appointment.suggestedFilename()).toBe("pouragenda-appointments.csv");
    const appointmentText = await fs.readFile((await appointment.path())!, "utf8");
    expect(appointmentText).toContain(marker); expect(appointmentText).not.toContain(foreign);
    expect(appointmentText).toContain("\"'=PRIVATE"); expect(appointmentText).toContain("\"\"line\"\"");
    for (const suffix of ["recurring", "modified", "cancelled occurrence", "completed", "archived"]) {
      expect(appointmentText).toContain(`${marker} ${suffix}`);
    }
    expect(appointmentText).toContain("UTC");

    const contactDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export contacts CSV" }).click();
    const contact = await contactDownload;
    expect(contact.suggestedFilename()).toBe("pouragenda-contacts.csv");
    const contactText = await fs.readFile((await contact.path())!, "utf8");
    expect(contactText).toContain(marker); expect(contactText).not.toContain(foreign); expect(contactText).toContain("\"'=SUM(1)");

    const jsonDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export settings JSON" }).click();
    const jsonText = await fs.readFile((await (await jsonDownload).path())!, "utf8");
    expect(jsonText).not.toMatch(/password|token_hash|service_role|sb_secret_/i);

    const icsDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export calendar ICS" }).click();
    const ics = await icsDownload;
    expect(ics.suggestedFilename()).toBe("pouragenda-calendar.ics");
    const icsText = await fs.readFile((await ics.path())!, "utf8");
    expect(icsText).toContain("BEGIN:VCALENDAR"); expect(icsText).toContain(marker);
    expect(icsText).toContain("UID:"); expect(icsText).toContain("LAST-MODIFIED:");
    expect(icsText).toContain("RRULE:FREQ=WEEKLY;INTERVAL=1");
    expect(icsText).toContain("RECURRENCE-ID:"); expect(icsText).toContain("EXDATE:");
    expect(icsText).toContain("X-WR-TIMEZONE:UTC");
    expect(icsText).not.toContain("PRIVATE"); expect(icsText).not.toContain(foreign);
  } finally {
    await Promise.all([
      a.from("appointments").delete().in("id", ownedAppointmentIds), b.from("appointments").delete().eq("title", foreign),
      a.from("contacts").delete().like("name", `%${marker}`), b.from("contacts").delete().eq("name", foreign),
    ]);
    await a.from("appointment_activity").delete().eq("action", "export_requested");
    await Promise.all([a.auth.signOut(), b.auth.signOut()]);
  }
});

test("large appointment export uses bounded server pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Large live export runs once in desktop Chromium.");
  const client = await liveClient("A");
  const marker = `Large export ${Date.now()}`;
  const userId = (await client.auth.getUser()).data.user!.id;
  const categoryId = (await client.from("categories").select("id").limit(1).single()).data!.id;
  const start = new Date(Date.now() + 10 * 864e5);
  const rows = Array.from({ length: 501 }, (_, index) => {
    const begins = new Date(start.getTime() + index * 60_000);
    const ends = new Date(begins.getTime() + 30 * 60_000);
    return {
      user_id: userId, category_id: categoryId, title: `${marker} ${index}`, kind: "personal",
      starts_at: begins.toISOString(), ends_at: ends.toISOString(),
      intended_local_start: begins.toISOString().slice(0, 19).replace("T", " "),
      intended_local_end: ends.toISOString().slice(0, 19).replace("T", " "),
      timezone: "UTC", all_day: false, status: "pending", archived: false,
    };
  });
  try {
    for (let index = 0; index < rows.length; index += 200) {
      const result = await client.from("appointments").insert(rows.slice(index, index + 200));
      expect(result.error).toBeNull();
    }
    await loginPage(page);
    await page.goto("/settings");
    let appointmentRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "GET" && request.url().includes("/rest/v1/appointments")) {
        appointmentRequests += 1;
      }
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export appointments CSV" }).click();
    const text = await fs.readFile((await (await download).path())!, "utf8");
    expect(text).toContain(`${marker} 0`); expect(text).toContain(`${marker} 500`);
    expect(appointmentRequests).toBeGreaterThanOrEqual(2);
  } finally {
    await client.from("appointments").delete().like("title", `${marker}%`);
    await client.from("appointment_activity").delete().eq("action", "export_requested");
    await client.auth.signOut();
  }
});
