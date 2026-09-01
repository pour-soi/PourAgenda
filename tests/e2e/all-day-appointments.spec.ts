import { expect, test } from "@playwright/test";
import { createCalendarMockState, openCalendarLayoutPreview, previewAppointment } from "./calendar-layout-fixtures";

const nextDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const allDayAppointment = (id: string, title: string, start: string, inclusiveEnd: string) => ({
  ...previewAppointment(id, title, "personal", `${start}T00:00:00.000Z`, `${nextDate(inclusiveEnd)}T00:00:00.000Z`, true),
  timezone: "America/Los_Angeles",
  intended_local_start: `${start} 00:00:00`,
  intended_local_end: `${inclusiveEnd} 00:00:00`,
});

test("all-day dates render and rehydrate without a timezone shift", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers the editor date contract.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");

  const sameDay = allDayAppointment("all-day-same", "Nov 25 only", "2026-11-25", "2026-11-25");
  const multiDay = allDayAppointment("all-day-multi", "HOLIDAY", "2026-11-26", "2026-11-27");
  const state = createCalendarMockState();
  await openCalendarLayoutPreview(page, state);
  state.appointments.push(sameDay, multiDay);
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-11-26"));
  await page.waitForFunction(() => Boolean(
    window.__pourAgendaCalendar?.getEventById("all-day-same")
    && window.__pourAgendaCalendar?.getEventById("all-day-multi"),
  ));

  const ranges = await page.evaluate(() => ["all-day-same", "all-day-multi"].map((id) => {
    const event = window.__pourAgendaCalendar?.getEventById(id);
    return { id, start: event?.startStr, end: event?.endStr };
  }));
  expect(ranges).toEqual([
    { id: "all-day-same", start: "2026-11-25", end: "2026-11-26" },
    { id: "all-day-multi", start: "2026-11-26", end: "2026-11-28" },
  ]);

  await page.locator('[data-appointment-id="all-day-multi"]').first().click();
  const dialog = page.getByRole("dialog", { name: "Edit appointment" });
  await expect(dialog.getByRole("textbox", { name: "Start" })).toHaveValue("11/26/2026");
  await expect(dialog.getByRole("textbox", { name: "End" })).toHaveValue("11/27/2026");
});

test("all-day Month bars span inclusive dates and split only at week boundaries", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Chromium viewport changes cover desktop and portrait Month geometry deterministically.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");

  const state = createCalendarMockState();
  await openCalendarLayoutPreview(page, state);
  state.appointments.push(
    allDayAppointment("same-day", "Single day", "2026-11-25", "2026-11-25"),
    allDayAppointment("same-week", "HOLIDAY", "2026-11-26", "2026-11-27"),
    allDayAppointment("long-same-week", "Long same week", "2026-11-22", "2026-11-24"),
    allDayAppointment("week-boundary", "Week boundary", "2026-11-28", "2026-11-29"),
    allDayAppointment("month-boundary", "Month boundary", "2026-11-30", "2026-12-02"),
  );
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-11-26"));
  await page.waitForFunction(() => ["same-day", "same-week", "long-same-week", "week-boundary", "month-boundary"].every(
    (id) => Boolean(window.__pourAgendaCalendar?.getEventById(id)),
  ));

  const geometry = await page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const cell = (date: string) => rect(document.querySelector(`[data-date="${date}"]`));
    const segments = (id: string) => Array.from(document.querySelectorAll(`[data-appointment-id="${id}"]`)).map(rect);
    const placements = (id: string) => Array.from(document.querySelectorAll(`[data-appointment-id="${id}"]`)).map((event) => {
      const harness = event.closest(".fc-daygrid-event-harness");
      const dayEvents = harness?.closest(".fc-daygrid-day-events") ?? null;
      const dayCell = harness?.closest(".fc-daygrid-day") ?? null;
      return {
        event: rect(event),
        harness: rect(harness),
        dayEvents: rect(dayEvents),
        cell: rect(dayCell),
        date: dayCell?.getAttribute("data-date") ?? null,
        absolute: harness?.classList.contains("fc-daygrid-event-harness-abs") ?? false,
        harnessPosition: harness ? getComputedStyle(harness).position : null,
        harnessTop: harness ? getComputedStyle(harness).top : null,
        dayEventsPosition: dayEvents ? getComputedStyle(dayEvents).position : null,
      };
    });
    return {
      cells: {
        d22: cell("2026-11-22"), d23: cell("2026-11-23"), d24: cell("2026-11-24"),
        d25: cell("2026-11-25"), d26: cell("2026-11-26"), d27: cell("2026-11-27"),
        d28: cell("2026-11-28"), d29: cell("2026-11-29"), d30: cell("2026-11-30"),
        d01: cell("2026-12-01"), d02: cell("2026-12-02"),
      },
      sameDay: segments("same-day"),
      sameWeek: segments("same-week"),
      longSameWeek: segments("long-same-week"),
      weekBoundary: segments("week-boundary"),
      monthBoundary: segments("month-boundary"),
      placements: {
        sameDay: placements("same-day"),
        sameWeek: placements("same-week"),
        longSameWeek: placements("long-same-week"),
        weekBoundary: placements("week-boundary"),
        monthBoundary: placements("month-boundary"),
      },
    };
  });

  const { cells } = geometry;
  for (const cell of Object.values(cells)) expect(cell).not.toBeNull();
  expect(geometry.sameDay).toHaveLength(1);
  expect(geometry.sameDay[0]!.width).toBeLessThan(cells.d25!.width * 1.1);
  expect(geometry.sameWeek).toHaveLength(1);
  expect(geometry.sameWeek[0]!.left).toBeGreaterThanOrEqual(cells.d26!.left);
  expect(geometry.sameWeek[0]!.right).toBeLessThanOrEqual(cells.d27!.right + 1);
  expect(geometry.sameWeek[0]!.width).toBeGreaterThan(cells.d26!.width * 1.5);
  expect(geometry.longSameWeek).toHaveLength(1);
  expect(geometry.longSameWeek[0]!.left).toBeGreaterThanOrEqual(cells.d22!.left);
  expect(geometry.longSameWeek[0]!.right).toBeLessThanOrEqual(cells.d24!.right + 1);
  expect(geometry.longSameWeek[0]!.width).toBeGreaterThan(cells.d22!.width * 2.5);
  expect(geometry.weekBoundary).toHaveLength(2);
  expect(geometry.weekBoundary[0]!.left).toBeGreaterThanOrEqual(cells.d28!.left);
  expect(geometry.weekBoundary[0]!.right).toBeLessThanOrEqual(cells.d28!.right + 1);
  expect(geometry.weekBoundary[1]!.left).toBeGreaterThanOrEqual(cells.d29!.left);
  expect(geometry.weekBoundary[1]!.right).toBeLessThanOrEqual(cells.d29!.right + 1);
  expect(Math.abs(geometry.weekBoundary[0]!.height - geometry.weekBoundary[1]!.height)).toBeLessThanOrEqual(1);
  expect(geometry.monthBoundary).toHaveLength(1);
  expect(geometry.monthBoundary[0]!.left).toBeGreaterThanOrEqual(cells.d30!.left);
  expect(geometry.monthBoundary[0]!.right).toBeLessThanOrEqual(cells.d02!.right + 1);
  expect(geometry.monthBoundary[0]!.width).toBeGreaterThan(cells.d30!.width * 2.5);

  const baseline = geometry.placements.sameDay[0]!;
  expect(baseline.absolute).toBe(false);
  expect(baseline.harnessPosition).toBe("relative");
  const baselineTop = baseline.event!.top - baseline.cell!.top;
  const multiDayPlacements = [
    ...geometry.placements.sameWeek,
    ...geometry.placements.longSameWeek,
    ...geometry.placements.weekBoundary,
    ...geometry.placements.monthBoundary,
  ];
  expect(multiDayPlacements.some((placement) => placement.absolute)).toBe(true);
  for (const placement of multiDayPlacements) {
    if (placement.absolute) {
      expect(placement.harnessPosition).toBe("absolute");
      expect(placement.harnessTop).toBe("0px");
      expect(placement.dayEventsPosition).toBe("relative");
      expect(Math.abs(placement.harness!.top - placement.dayEvents!.top)).toBeLessThanOrEqual(1);
    } else {
      expect(placement.harnessPosition).toBe("relative");
    }
    expect(Math.abs((placement.event!.top - placement.cell!.top) - baselineTop)).toBeLessThanOrEqual(1);
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const mobile = await page.evaluate(() => {
      const event = document.querySelector('[data-appointment-id="same-week"]');
      const start = document.querySelector('[data-date="2026-11-26"]');
      const end = document.querySelector('[data-date="2026-11-27"]');
      const eventRect = event?.getBoundingClientRect();
      const startRect = start?.getBoundingClientRect();
      const endRect = end?.getBoundingClientRect();
      return {
        eventWidth: eventRect?.width ?? 0,
        cellWidth: startRect?.width ?? 0,
        contained: Boolean(eventRect && startRect && endRect
          && eventRect.left >= startRect.left && eventRect.right <= endRect.right + 1),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(mobile.eventWidth).toBeGreaterThan(mobile.cellWidth * 1.5);
    expect(mobile.contained).toBe(true);
    expect(mobile.overflow).toBeLessThanOrEqual(1);
  }
});
