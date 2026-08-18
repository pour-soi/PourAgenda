import type { Page } from "@playwright/test";

export const previewDate = "2026-07-29";

export const previewAppointment = (
  id: string,
  title: string,
  categoryId: string,
  startsAt: string,
  endsAt: string,
  allDay = false,
) => ({
  id,
  user_id: "layout-preview",
  category_id: categoryId,
  contact_id: null,
  title,
  kind: "personal",
  starts_at: startsAt,
  ends_at: endsAt,
  intended_local_start: startsAt.slice(0, 19).replace("T", " "),
  intended_local_end: endsAt.slice(0, 19).replace("T", " "),
  timezone: "UTC",
  all_day: allDay,
  location: null,
  phone: null,
  email: null,
  public_notes: null,
  private_notes: null,
  status: "confirmed",
  reminder_minutes: [10],
  recurrence_frequency: null,
  recurrence_interval: null,
  recurrence_until: null,
  recurrence_count: null,
  series_id: null,
  original_occurrence_start: null,
  created_at: "2026-07-20T12:00:00.000Z",
  completed_at: null,
  cancelled_at: null,
  updated_at: "2026-07-20T12:00:00.000Z",
});

export const previewAppointments = [
  previewAppointment("preview-1", "Quarterly planning with a deliberately long title", "focus", "2026-07-29T16:00:00.000Z", "2026-07-29T17:30:00.000Z"),
  previewAppointment("preview-2", "Design review", "personal", "2026-07-29T20:00:00.000Z", "2026-07-29T21:00:00.000Z"),
  previewAppointment("preview-3", "Personal day", "personal", "2026-07-30T07:00:00.000Z", "2026-07-31T07:00:00.000Z", true),
  previewAppointment("preview-4", "Roadmap notes", "planning", "2026-07-31T18:00:00.000Z", "2026-07-31T19:00:00.000Z"),
  previewAppointment("preview-5", "Project check-in", "focus", "2026-08-01T17:00:00.000Z", "2026-08-01T18:00:00.000Z"),
  previewAppointment("preview-6", "Prepare the week", "planning", "2026-08-03T15:00:00.000Z", "2026-08-03T16:00:00.000Z"),
];

export type CalendarMockState = {
  appointments: typeof previewAppointments;
  delayMs: number;
  fail: boolean;
};

export const createCalendarMockState = (): CalendarMockState => ({
  appointments: [...previewAppointments],
  delayMs: 0,
  fail: false,
});

export async function installCalendarLayoutMocks(page: Page, state: CalendarMockState) {
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  await page.unroute("**/rest/v1/appointments*");
  await page.unroute("**/rest/v1/appointment_shares*");
  await page.route("**/rest/v1/appointments*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "Preview is read-only." }) });
      return;
    }
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    if (state.fail) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "PGRST000", details: null, hint: null, message: "Preview load failed." }),
      });
      return;
    }
    const url = decodeURIComponent(route.request().url());
    const recurringQuery = url.includes("recurrence_frequency=not.is.null");
    const id = /(?:\?|&)id=eq\.([^&]+)/.exec(url)?.[1];
    const rows = recurringQuery ? [] : id ? state.appointments.filter((item) => item.id === id) : state.appointments;
    const objectResponse = route.request().headers().accept?.includes("application/vnd.pgrst.object");
    const body = objectResponse ? rows[0] ?? null : rows;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" },
      body: JSON.stringify(body),
    });
  });
  await page.route("**/rest/v1/appointment_shares*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
}

export async function openCalendarLayoutPreview(page: Page, state = createCalendarMockState(), query = "") {
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await installCalendarLayoutMocks(page, state);
  await page.goto(`/privacy/layout-preview${query}`);
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
  await page.locator(".fc").waitFor();
  await page.evaluate((date) => window.__pourAgendaCalendar?.gotoDate(date), previewDate);
  if (state.appointments.length && !state.fail) {
    await page.waitForFunction(() => (window.__pourAgendaCalendar?.getEvents().length ?? 0) > 0);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
}
