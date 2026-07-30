import { expect, test } from "@playwright/test";
import {
  createCalendarMockState,
  installCalendarLayoutMocks,
  openCalendarLayoutPreview,
  previewDate,
} from "./calendar-layout-fixtures";

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
      await expect(targetCell.locator(".fc-more-link")).toHaveText("+1");
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
  await targetCell.locator(".fc-more-link").click();
  const popover = page.locator(".fc-more-popover");
  await expect(popover.locator(".fc-popover-title")).toContainText(/Jul.*29/);
  await expect(popover.locator('[data-appointment-id="preview-1"]')).toBeVisible();
  await expect(popover.locator('[data-appointment-id="preview-2"]')).toBeVisible();
  await popover.locator('[data-appointment-id="preview-2"]').click();
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
