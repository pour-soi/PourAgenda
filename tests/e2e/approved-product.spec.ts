import { expect, test } from "@playwright/test";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test("event workflow is category-only with safe time defaults", async ({ page }) => {
  await loginPage(page);
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create appointment" });

  await expect(dialog.getByLabel("Category")).toBeVisible();
  for (const removed of ["Classification", "Contact", "Status", "Phone", "Email"]) {
    await expect(dialog.getByLabel(removed, { exact: false })).toHaveCount(0);
  }

  const start = dialog.getByLabel("Start");
  const end = dialog.getByLabel("End");
  const startValue = await start.inputValue();
  const endValue = await end.inputValue();
  expect(Date.parse(endValue) - Date.parse(startValue)).toBeGreaterThan(0);

  await end.fill(`${startValue.slice(0, 10)}T23:00`);
  await start.fill(`${startValue.slice(0, 10)}T08:00`);
  await expect(end).toHaveValue(`${startValue.slice(0, 10)}T23:00`);
  await end.fill(`${startValue.slice(0, 10)}T07:00`);
  await expect(dialog.getByRole("alert")).toContainText("End must not be earlier");
});

test("mobile month header uses two balanced rows without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loginPage(page);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const title = await page.locator(".calendar-toolbar-title").boundingBox();
  const navigation = await page.locator(".calendar-toolbar-navigation").boundingBox();
  const views = await page.locator(".calendar-view-selector").boundingBox();
  expect(title && navigation && views).toBeTruthy();
  expect(Math.abs(title!.y - navigation!.y)).toBeLessThan(8);
  expect(views!.y).toBeGreaterThan(title!.y + title!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("manifest exposes full and maskable icon sets", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  const icons = manifest.icons as { sizes: string; purpose?: string }[];
  for (const size of ["48x48", "64x64", "128x128", "192x192", "256x256", "512x512"]) {
    expect(icons.some((icon) => icon.sizes === size)).toBe(true);
  }
  expect(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "maskable")).toBe(true);
  expect(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true);
});

test("automatic and manual timezone preferences synchronize across devices", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Cross-device persistence runs once in desktop Chromium.");
  const client = await liveClient();
  const original = (await client.from("user_settings").select("automatic_timezone,timezone").single()).data!;
  const firstContext = await browser.newContext({ timezoneId: "UTC" });
  const secondContext = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await loginPage(first);
    await first.goto("/settings");
    const automatic = first.getByLabel("Automatically detect time zone");
    await automatic.check();
    await first.getByRole("button", { name: "Save settings" }).click();
    await expect(first.getByText("Settings saved.")).toBeVisible();

    await loginPage(second);
    await second.goto("/settings");
    await expect(second.getByLabel("Automatically detect time zone")).toBeChecked();

    await automatic.uncheck();
    await first.getByLabel("Search by city or time zone").fill("Asia/Tokyo");
    await first.getByRole("button", { name: "Save settings" }).click();
    await expect(first.getByText("Settings saved.")).toBeVisible();

    await second.reload();
    await expect(second.getByLabel("Automatically detect time zone")).not.toBeChecked();
    await expect(second.getByLabel("Search by city or time zone")).toHaveValue("Asia/Tokyo");
  } finally {
    await client.from("user_settings").update(original).select();
    await client.auth.signOut();
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

test("category color drives month, week, day, and agenda rendering", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One live category-color flow is sufficient.");
  const client = await liveClient();
  const user = (await client.auth.getUser()).data.user;
  await client.from("categories").delete().like("name", "Category color %");
  const title = `Category color ${Date.now()}`;
  const { data: category, error } = await client.from("categories").insert({
    user_id: user!.id, name: title, color: "#2F6959", hidden: false,
  }).select("id").single();
  if (error || !category) throw new Error("Could not create the disposable color category.");
  const event = await createLiveAppointment(client, title, { category_id: category.id });
  try {
    await loginPage(page);
    for (const view of ["Month", "Week", "Day"] as const) {
      await page.evaluate((start) => window.__pourAgendaCalendar?.gotoDate(start), event.starts_at);
      await page.getByRole("button", { name: view, exact: true }).click();
      const rendered = page.locator(`[data-appointment-id="${event.id}"]`);
      await expect(rendered).toBeVisible();
      expect(await rendered.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#2F6959");
    }
    await page.evaluate((start) => window.__pourAgendaCalendar?.gotoDate(start), event.starts_at);
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    const agendaEvent = page.locator(`[data-appointment-id="${event.id}"]`);
    await expect(agendaEvent).toBeVisible();
    expect(await agendaEvent.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#2F6959");

    await client.from("categories").update({ color: "#A26068" }).eq("id", category.id);
    await page.reload();
    const updated = page.locator(`[data-appointment-id="${event.id}"]`);
    await expect(updated).toBeVisible();
    expect(await updated.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#A26068");
  } finally {
    await client.from("appointments").delete().eq("title", title);
    await client.from("categories").delete().eq("id", category.id);
    await client.auth.signOut();
  }
});
