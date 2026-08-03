import { expect, test } from "@playwright/test";
import {
  createCalendarMockState,
  openCalendarLayoutPreview,
  previewDate,
} from "./calendar-layout-fixtures";

test.describe("Phase 1 personal productivity foundation", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Focused Chromium coverage uses the local privacy-safe preview.");
    test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.removeItem("pouragenda-calendar-view"));
    await openCalendarLayoutPreview(page);
  });

  test("Month remains the default and Today preserves all four selected views", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Go to current month" })).toHaveText("Today");
    await expect(page.locator(".calendar-view-selector > button")).toHaveCount(4);
    await expect(page.locator(".calendar-view-selector").getByText("Today", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Next period" }).click();
    await page.getByRole("button", { name: "Go to current month" }).click();
    await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`.fc-daygrid-day[data-date="${previewDate}"]`)).toBeVisible();

    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page.getByRole("button", { name: "Next period" }).click();
    await page.getByRole("button", { name: "Go to current week" }).click();
    await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`.fc-timegrid-col[data-date="${previewDate}"]`)).toBeVisible();

    await page.getByRole("button", { name: "Day", exact: true }).click();
    await page.getByRole("button", { name: "Next period" }).click();
    await page.getByRole("button", { name: "Go to today" }).click();
    await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Wednesday, July 29" })).toBeVisible();

    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page.getByRole("button", { name: "Next period" }).click();
    await page.getByRole("button", { name: "Go to today's agenda" }).click();
    await expect(page.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".fc-list-day").first()).toContainText("Wed");
  });

  test("Day presents selected-date context, summary, next event, free time, and stable navigation", async ({ page }) => {
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.locator(".day-experience").getByText("Today", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Wednesday, July 29" })).toBeVisible();
    await expect(page.getByText("2 events · 2h 30m scheduled")).toBeVisible();
    const next = page.getByRole("button", { name: /Design review/ });
    await expect(next).toContainText("Starts in 2h");
    await expect(next).toContainText("Personal");
    await expect(page.getByText("Free until 8:00 PM")).toBeVisible();
    await expect(page.locator(".fc-timegrid-now-indicator-line")).toBeVisible();
    await expect(page.locator('[data-appointment-id="preview-1"] .calendar-event-time')).toContainText("4:00");

    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page.getByText("Tomorrow", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thursday, July 30" })).toBeVisible();
    await expect(page.locator(".fc-timegrid-now-indicator-line")).toHaveCount(0);

    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page.getByRole("heading", { name: "Friday, July 31" })).toBeVisible();
    await expect(page.getByText("Tomorrow", { exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("heading", { name: "Friday, July 31" })).toBeVisible();
    await page.locator('[data-appointment-id="preview-4"]').click();
    await expect(page.getByRole("dialog", { name: "Edit appointment" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Friday, July 31" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("Next Event opens the correct appointment and empty Day offers restrained actions", async ({ page }) => {
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await page.getByRole("button", { name: /Design review/ }).click();
    await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByLabel("Title")).toHaveValue("Design review");
    await page.getByRole("button", { name: "Close" }).click();

    const empty = createCalendarMockState();
    empty.appointments = [];
    await openCalendarLayoutPreview(page, empty);
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByText("Nothing scheduled")).toBeVisible();
    await expect(page.getByText("No events scheduled for this day")).toBeVisible();
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByRole("dialog", { name: "Create appointment" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Return to Month" }).click();
    await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("overlapping current events use the most recent start and expose a semantic current state", async ({ page }) => {
    const state = createCalendarMockState();
    state.appointments = [
      ...state.appointments,
      {
        ...state.appointments[0],
        id: "current-one",
        title: "Writing session",
        starts_at: "2026-07-29T17:30:00.000Z",
        ends_at: "2026-07-29T18:30:00.000Z",
      },
      {
        ...state.appointments[0],
        id: "current-two",
        title: "Planning call",
        starts_at: "2026-07-29T17:45:00.000Z",
        ends_at: "2026-07-29T18:15:00.000Z",
      },
    ];
    await openCalendarLayoutPreview(page, state);
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByRole("button", { name: /Planning call/ })).toContainText("Happening now");
    await expect(page.locator('[data-appointment-id="current-two"]')).toHaveAttribute("data-time-state", "current");
    await expect(page.locator('[data-appointment-id="current-two"]')).toHaveAttribute("aria-label", /current event/);
  });

  test("Quick Add pre-fills the existing editor and keeps ambiguous time editable", async ({ page }) => {
    const quickAdd = page.getByRole("textbox", { name: "Quick Add" });
    await quickAdd.fill("Dentist tomorrow 2pm");
    await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
    const editor = page.getByRole("dialog", { name: "Create appointment" });
    await expect(editor.getByLabel("Title")).toHaveValue("Dentist");
    await expect(editor.getByRole("button", { name: "Choose start date" })).toContainText("07/30/2026");
    await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("2:00 PM");
    await expect(editor.getByRole("button", { name: "Choose end date" })).toContainText("07/30/2026");
    await expect(editor.getByRole("button", { name: "Choose end time" })).toContainText("3:00 PM");
    await expect(editor).toContainText("Review before saving");
    await editor.getByRole("button", { name: "Close" }).click();

    await quickAdd.fill("Coffee Saturday");
    await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
    await expect(editor.getByLabel("Title")).toHaveValue("Coffee");
    await expect(editor.getByRole("button", { name: "Choose start date" })).toContainText("08/01/2026");
    await expect(editor).toContainText("Date recognized. Choose a time before saving.");
    await editor.getByRole("button", { name: "Close" }).click();

    await quickAdd.fill("255 Howth Street client 8/15 4pm");
    await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
    await expect(editor.getByLabel("Title")).toHaveValue("client");
    await expect(editor.getByLabel("Location")).toHaveValue("255 Howth Street");
    await expect(editor.getByRole("button", { name: "Choose start date" })).toContainText("08/15/2026");
    await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("4:00 PM");
    await expect(editor.getByRole("button", { name: "Choose end date" })).toContainText("08/15/2026");
    await expect(editor.getByRole("button", { name: "Choose end time" })).toContainText("5:00 PM");
  });

  test("global search ranks authorized fields and supports keyboard open, navigation, close, and focus return", async ({ page }) => {
    const searchButton = page.getByRole("button", { name: "Search events" });
    await searchButton.click();
    const dialog = page.getByRole("dialog", { name: "Search events" });
    await expect(dialog.getByText("Start typing to search your authorized events.")).toBeVisible();
    const input = dialog.getByPlaceholder("Search your calendar");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(searchButton).toBeFocused();

    await page.keyboard.press("Control+k");
    await input.fill("design");
    await expect(dialog.getByRole("option").first()).toContainText("Design review");
    await input.press("ArrowDown");
    await input.press("ArrowUp");
    await input.press("Enter");
    await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByLabel("Title")).toHaveValue("Design review");
    await page.getByRole("button", { name: "Close" }).click();

    await page.keyboard.press("Control+k");
    await input.fill("does not exist");
    await expect(dialog.getByText("No events found.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.keyboard.press("/");
    await expect(dialog).toBeVisible();
    await input.fill("Personal");
    await expect(dialog.getByRole("option").first()).toContainText("Personal");
  });

  test("offline Quick Add keeps the draft in the editor and search clearly limits itself to loaded events", async ({ page, context }) => {
    await context.setOffline(true);
    await expect(page.getByText(/You’re offline/)).toBeVisible();
    await page.getByRole("textbox", { name: "Quick Add" }).fill("Lunch today noon");
    await page.getByRole("button", { name: "Open event editor with Quick Add" }).click();
    const editor = page.getByRole("dialog", { name: "Create appointment" });
    await expect(editor.getByLabel("Title")).toHaveValue("Lunch");
    await editor.getByRole("button", { name: "Save appointment" }).click();
    await expect(editor.getByText("Reconnect before saving this appointment.")).toBeVisible();
    await editor.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Search events" }).click();
    const search = page.getByRole("dialog", { name: "Search events" });
    await expect(search.getByText(/limited to appointments already loaded/)).toBeVisible();
    await search.getByPlaceholder("Search your calendar").fill("Design");
    await expect(search.getByRole("option")).toContainText("Design review");
    await context.setOffline(false);
  });
});
