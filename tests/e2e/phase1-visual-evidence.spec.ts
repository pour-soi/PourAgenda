import { expect, test, type Page } from "@playwright/test";
import {
  createCalendarMockState,
  installCalendarLayoutMocks,
  openCalendarLayoutPreview,
  previewAppointment,
} from "./calendar-layout-fixtures";

async function capture(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `docs/images/phase1-${name}.png`, fullPage: false });
}

test("capture privacy-safe Phase 1 product evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One local Chromium project captures deterministic synthetic evidence.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");

  for (const [name, width, height] of [
    ["month-320", 320, 568],
    ["month-390", 390, 844],
    ["month-430", 430, 932],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openCalendarLayoutPreview(page);
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await capture(page, name);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendarLayoutPreview(page);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await capture(page, "day-today-next-free-time");
  await page.getByRole("button", { name: "Next period" }).click();
  await capture(page, "day-tomorrow-all-day");
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-08-03"));
  await expect(page.getByRole("heading", { name: "Monday, August 3" })).toBeVisible();
  await capture(page, "day-future");

  const current = createCalendarMockState();
  current.appointments = [
    ...current.appointments,
    previewAppointment("current-focus", "Writing session", "focus", "2026-07-29T17:30:00.000Z", "2026-07-29T18:30:00.000Z"),
  ];
  await openCalendarLayoutPreview(page, current);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await capture(page, "day-current-event");

  current.appointments = [
    ...current.appointments,
    previewAppointment("current-overlap", "Planning call", "planning", "2026-07-29T17:45:00.000Z", "2026-07-29T18:15:00.000Z"),
  ];
  await openCalendarLayoutPreview(page, current);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await capture(page, "day-overlapping-events");

  const empty = createCalendarMockState();
  empty.appointments = [];
  await openCalendarLayoutPreview(page, empty);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await capture(page, "day-empty");

  await openCalendarLayoutPreview(page);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await capture(page, "mobile-week");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await capture(page, "agenda");

  await page.getByRole("button", { name: "Month", exact: true }).click();
  const quickAdd = page.getByRole("textbox", { name: "Quick Add" });
  await quickAdd.fill("Dentist tomorrow 2pm");
  await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
  await capture(page, "quick-add-recognized");
  await page.getByRole("button", { name: "Close" }).click();
  await quickAdd.fill("Coffee Saturday");
  await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
  await capture(page, "quick-add-ambiguous");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Search events" }).click();
  const search = page.getByPlaceholder("Search your calendar");
  await search.fill("design");
  await expect(page.getByRole("option")).toHaveCount(1);
  await capture(page, "search-results");
  await search.fill("synthetic missing event");
  await expect(page.getByText("No events found.")).toBeVisible();
  await capture(page, "search-no-results");
  await page.keyboard.press("Escape");

  const loading = createCalendarMockState();
  loading.delayMs = 1500;
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await installCalendarLayoutMocks(page, loading);
  await page.goto("/privacy/layout-preview");
  await page.getByRole("status", { name: "Loading appointments" }).waitFor();
  await capture(page, "loading");
  await page.locator(".fc").waitFor();

  const error = createCalendarMockState();
  error.fail = true;
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await installCalendarLayoutMocks(page, error);
  await page.goto("/privacy/layout-preview");
  await expect(page.locator(".calendar-error-card")).toBeVisible();
  await capture(page, "error-retry");

  for (const [name, width, height] of [
    ["iphone-landscape-day", 844, 390],
    ["tablet-day", 768, 1024],
    ["desktop-day", 1440, 1000],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openCalendarLayoutPreview(page);
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await capture(page, name);
  }
});
