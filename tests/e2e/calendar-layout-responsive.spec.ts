import { expect, test } from "@playwright/test";
import {
  createCalendarMockState,
  installCalendarLayoutMocks,
  openCalendarLayoutPreview,
  previewAppointment,
  previewDate,
} from "./calendar-layout-fixtures";

test.use({ serviceWorkers: "block" });

test("calendar layout follows the approved responsive breakpoints", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers the exact viewport matrix.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 1000 },
  ]) {
    const compactWeek = viewport.width < 600 || (viewport.height <= 500 && viewport.width <= 932);
    await page.setViewportSize(viewport);
    await openCalendarLayoutPreview(page);
    await page.getByRole("button", { name: "Month", exact: true }).click();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const card = await page.locator(".calendar-card").boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x).toBeGreaterThanOrEqual(viewport.width < 1024 ? 16 : 24);
    expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width);

    if (viewport.width < 600) {
      const title = await page.locator(".calendar-toolbar-title").boundingBox();
      const navigation = await page.locator(".calendar-toolbar-navigation").boundingBox();
      const selector = await page.locator(".calendar-view-selector").boundingBox();
      expect(title && navigation && selector).toBeTruthy();
      expect(Math.abs(title!.y - navigation!.y)).toBeLessThan(8);
      expect(selector!.y).toBeGreaterThan(title!.y + title!.height);
      for (const control of await page.locator(".calendar-toolbar button").all()) {
        const bounds = await control.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(40);
      }

      const targetCell = page.locator(`.fc-daygrid-day[data-date="${previewDate}"]`);
      const frame = await targetCell.locator(".fc-daygrid-day-frame").boundingBox();
      expect(frame!.height).toBeGreaterThanOrEqual(56);
      expect(frame!.height, `${viewport.width}px month cell height`).toBeLessThanOrEqual(viewport.width < 390 ? 66 : 76);
      await expect(targetCell.locator(".mobile-month-event-count")).toHaveText("2");
      await expect(targetCell.locator(".fc-more-link:visible")).toHaveCount(0);
      await expect(targetCell).not.toContainText(/\+\d+/);
      expect(await targetCell.locator('[data-appointment-id]:visible').count()).toBe(1);
    }

    await page.getByRole("button", { name: "Week", exact: true }).click();
    const weekDates = await page.locator(".fc-timegrid-col[data-date]").evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute("data-date")))].filter(Boolean),
    );
    expect(weekDates).toHaveLength(compactWeek ? 1 : 7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Day", exact: true }).click();
    const dayDates = await page.locator(".fc-timegrid-col[data-date]").evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute("data-date")))].filter(Boolean),
    );
    expect(dayDates).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('[data-appointment-id="preview-1"] .calendar-event-time')).toBeVisible();
    if (viewport.width === 390) {
      const event = page.locator('[data-appointment-id="preview-1"]');
      expect(await event.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#375f52");
      await event.click();
      await expect(page.getByRole("dialog", { name: "Edit appointment" })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    }

    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.locator(".fc-list")).toBeVisible();
    expect(await page.locator(".fc-list-event-graphic").count()).toBeGreaterThan(0);
    await expect(page.locator(".fc-list-event-graphic").first()).toBeHidden();
    await expect(page.locator(".fc-list-event").first()).toHaveCSS("box-shadow", /rgb/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    if (viewport.width < 1280) {
      const clearance = await page.locator(".mobile-content-clearance").evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingBottom),
      );
      const navigationHeight = (await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox())!.height;
      expect(clearance).toBeGreaterThanOrEqual(navigationHeight);
    }
  }
});

test("mobile Week maps between one and seven days on rotation without changing the selected tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers rotation.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendarLayoutPreview(page);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fc-timegrid-col[data-date]")).toHaveCount(1);
  const selectedDate = await page.locator(".fc-timegrid-col[data-date]").getAttribute("data-date");

  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.locator(".fc-timegrid-col[data-date]").count()).toBe(1);
  await expect(page.locator(`.fc-timegrid-col[data-date="${selectedDate}"]`)).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(async () => page.locator(".fc-timegrid-col[data-date]").count()).toBe(7);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.locator(".fc-timegrid-col[data-date]").count()).toBe(1);
  await expect(page.locator(`.fc-timegrid-col[data-date="${selectedDate}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("mobile calendar interactions preserve date, context, and readable time position", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers focused mobile interaction.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendarLayoutPreview(page);

  const monthTitle = await page.locator(".calendar-toolbar-title").textContent();
  const targetCell = page.locator(`.fc-daygrid-day[data-date="${previewDate}"]`);
  await targetCell.locator(".mobile-month-event-count").click();
  const sheet = page.getByRole("dialog", { name: "Wednesday, July 29" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveCount(2);
  await sheet.getByRole("button", { name: /Design review/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByLabel("Title")).toHaveValue("Design review");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".calendar-toolbar-title")).toHaveText(monthTitle ?? "");
  await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");

  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.locator(".divide-y > button")).toHaveCount(3);
  await upcoming.locator(".divide-y > button").first().click();
  await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByLabel("Title")).toHaveValue("Design review");
  await page.getByRole("button", { name: "Close" }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastUpcomingBounds = await upcoming.locator(".divide-y > button").last().boundingBox();
  const mobileNavBounds = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
  expect(lastUpcomingBounds!.y + lastUpcomingBounds!.height).toBeLessThanOrEqual(mobileNavBounds!.y);

  await page.getByRole("button", { name: "New appointment", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create appointment" });
  const headerDefaults = await createDialog.locator("input, select").evaluateAll((controls) => controls.map((control) => {
    const input = control as HTMLInputElement;
    return input.type === "checkbox" ? input.checked : input.value;
  }));
  await createDialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "Create", exact: true }).click();
  const navDefaults = await createDialog.locator("input, select").evaluateAll((controls) => controls.map((control) => {
    const input = control as HTMLInputElement;
    return input.type === "checkbox" ? input.checked : input.value;
  }));
  expect(navDefaults).toEqual(headerDefaults);
  await createDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".calendar-toolbar-title")).toContainText("Wed, Jul 29");
  await expect.poll(async () => page.locator(".fc-scroller").evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => node.scrollTop)),
  )).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(page.locator('.fc-timegrid-col[data-date="2026-07-30"]')).toBeVisible();
  await expect(page.locator(".calendar-toolbar-title")).toContainText("Thu, Jul 30");
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Previous period" }).click();
  await expect(page.locator(`.fc-timegrid-col[data-date="${previewDate}"]`)).toBeVisible();
  await page.locator('[data-appointment-id="preview-1"]').click();
  await expect(page.getByRole("dialog", { name: "Edit appointment" })).toBeVisible();
  const scrollWhileEditorOpen = await page.locator(".fc-scroller").evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => node.scrollTop)),
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(`.fc-timegrid-col[data-date="${previewDate}"]`)).toBeVisible();
  const scrollAfterEdit = await page.locator(".fc-scroller").evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => node.scrollTop)),
  );
  expect(Math.abs(scrollAfterEdit - scrollWhileEditorOpen)).toBeLessThan(4);
});

test("mobile Month day sheet preserves per-event colors, ordering, and calendar state", async ({ page }, testInfo) => {
  test.skip(!["desktop", "modern-iphone", "small-iphone"].includes(testInfo.project.name), "Portrait mobile viewport coverage only.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 390, height: 844 });
  const state = createCalendarMockState();
  state.appointments.push(
    previewAppointment("preview-all-day", "Conference day", "planning", "2026-07-29T00:00:00.000Z", "2026-07-29T23:59:59.000Z", true),
    previewAppointment("preview-crossing", "Late support", "focus", "2026-07-29T23:00:00.000Z", "2026-07-30T01:00:00.000Z"),
    ...Array.from({ length: 10 }, (_, index) => previewAppointment(
      `preview-extra-${index}`,
      `Extra appointment ${index + 1}`,
      index % 2 ? "personal" : "planning",
      `2026-07-29T${(10 + index).toString().padStart(2, "0")}:00:00.000Z`,
      `2026-07-29T${(10 + index).toString().padStart(2, "0")}:30:00.000Z`,
    )),
  );
  await openCalendarLayoutPreview(page, state);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const monthTitle = await page.locator(".calendar-toolbar-title").textContent();
  const targetCell = page.locator(`.fc-daygrid-day[data-date="${previewDate}"]`);
  const neighborCell = page.locator('.fc-daygrid-day[data-date="2026-07-30"]');
  const count = targetCell.locator(".mobile-month-event-count");
  const dateNumber = targetCell.locator(".mobile-month-date-number");
  await expect(count).toHaveText(String(state.appointments.filter((item) => item.starts_at.startsWith("2026-07-29")).length));
  await expect(targetCell.locator(".fc-more-link:visible")).toHaveCount(0);
  await expect(targetCell).not.toContainText(/\+\d+/);

  const frameBounds = (await targetCell.locator(".fc-daygrid-day-frame").boundingBox())!;
  const countBounds = (await count.boundingBox())!;
  const dateBounds = (await dateNumber.boundingBox())!;
  expect(countBounds.x).toBeLessThan(dateBounds.x);
  expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(frameBounds.x + frameBounds.width);

  const targetEventBounds = (await targetCell.locator(".fc-daygrid-event:visible").first().boundingBox())!;
  const neighborEventBounds = (await neighborCell.locator(".fc-daygrid-event:visible").first().boundingBox())!;
  expect(Math.abs(targetEventBounds.y - neighborEventBounds.y)).toBeLessThan(1);
  expect(targetEventBounds.height).toBeGreaterThanOrEqual(25);
  expect(targetEventBounds.x).toBeGreaterThanOrEqual(frameBounds.x);
  expect(targetEventBounds.x + targetEventBounds.width).toBeLessThanOrEqual(frameBounds.x + frameBounds.width);

  const visibleEvent = targetCell.locator('[data-appointment-id="preview-all-day"]:visible, [data-appointment-id="preview-1"]:visible').first();
  await visibleEvent.click();
  await expect(page.getByRole("dialog", { name: "Edit appointment" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Wednesday, July 29" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();

  await count.click();
  const sheet = page.getByRole("dialog", { name: "Wednesday, July 29" });
  await expect(sheet).toBeVisible();
  await expect(page.locator(".calendar-day-sheet-backdrop")).toHaveCount(1);
  await expect(page.locator(".fc-popover:visible")).toHaveCount(0);
  const rows = sheet.getByRole("button");
  await expect(rows.first()).toContainText("All day");
  await expect(rows.first()).toContainText("Conference day");
  await expect(rows.filter({ hasText: "Late support" })).toContainText(/11:00 PM–1:00 AM \(\+1 day\)/);
  expect(await rows.count()).toBe(state.appointments.filter((item) => item.starts_at.startsWith("2026-07-29")).length);
  await expect(rows.filter({ hasText: "Design review" }).locator(".calendar-day-sheet-dot")).toHaveCSS("background-color", "rgb(162, 96, 104)");
  expect(await sheet.locator(".calendar-day-sheet-list").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await sheet.getByRole("heading").click();
  await expect(sheet).toBeVisible();
  await page.locator(".calendar-day-sheet-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(sheet).toBeHidden();
  await expect(page.locator(".calendar-toolbar-title")).toHaveText(monthTitle ?? "");
  await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");

  const header = targetCell.locator(".mobile-month-day-header");
  const headerBounds = (await header.boundingBox())!;
  await header.click({ position: { x: Math.min(countBounds.width + 2, headerBounds.width - dateBounds.width - 2), y: 20 } });
  await expect(sheet).toBeVisible();
  await expect(page.locator(".fc-popover:visible")).toHaveCount(0);
  await sheet.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: 100, clientY: 100 }] });
  await sheet.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: 100, clientY: 180 }] });
  await expect(sheet).toBeHidden();

  await page.locator('.fc-daygrid-day[data-date="2026-07-28"] .fc-daygrid-day-top').click();
  await expect(page.getByRole("dialog", { name: /Tuesday, July 28/ })).toHaveCount(0);
});

test("FullCalendar refreshes custom category styles without affecting other appointments", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers FullCalendar event reuse.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 1024, height: 768 });
  const state = createCalendarMockState();
  await openCalendarLayoutPreview(page, state);

  const focus = page.locator('[data-appointment-id="preview-1"]:visible').first();
  const personal = page.locator('[data-appointment-id="preview-2"]:visible').first();
  await expect.poll(() => focus.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#375f52");
  await expect.poll(() => personal.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#a26068");

  state.appointments[0] = { ...state.appointments[0], category_id: "planning" };
  await page.getByRole("button", { name: "Filters" }).click();
  await page.locator('input[aria-label="Search appointments"]:visible').fill(" ");
  await page.getByRole("button", { name: "Show results" }).click();

  await expect.poll(() => focus.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#5e7296");
  await expect.poll(() => personal.evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#a26068");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect.poll(() => page.locator('[data-appointment-id="preview-2"]:visible').first()
    .evaluate((element) => element.style.getPropertyValue("--category-color"))).toBe("#a26068");
});

test("calendar loading, empty, and retry states do not flash misleading content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers local state fixtures.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  const state = createCalendarMockState();
  state.fail = true;
  state.delayMs = 1000;
  await installCalendarLayoutMocks(page, state);
  await page.goto("/privacy/layout-preview");
  await expect(page.getByRole("status", { name: "Loading appointments" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Upcoming" })).toHaveCount(0);
  const alert = page.locator(".calendar-error-card");
  await expect(alert).toContainText("Calendar unavailable");
  await expect(page.locator(".fc")).toHaveCount(0);

  state.fail = false;
  state.delayMs = 0;
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".fc")).toBeVisible();
  await expect(page.locator(".calendar-error-card")).toHaveCount(0);

  state.appointments = [];
  await page.reload();
  await expect(page.locator(".fc")).toBeVisible();
  await expect(page.getByRole("region", { name: "Upcoming" })).toContainText("No upcoming appointments");
});
