import { expect, test, type Page } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks } from "./calendar-layout-fixtures";

async function openTimePicker(page: Page, timeFormat: "locale" | "12h" | "24h" = "12h") {
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await page.goto(`/privacy/layout-preview?timeFormat=${timeFormat}`);
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const editor = page.getByRole("dialog", { name: "Create appointment" });
  await editor.getByLabel("Start").click();
  return {
    editor,
    picker: editor.getByRole("dialog", { name: "Start picker" }),
  };
}

test("custom time controls remain readable across the responsive matrix", async ({ page }) => {
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
    await page.setViewportSize(viewport);
    const { picker } = await openTimePicker(page);
    const hour = picker.getByRole("textbox", { name: "Hour" });
    const minute = picker.getByRole("textbox", { name: "Minute" });
    const period = picker.getByRole("group", { name: "AM/PM" });
    const boxes = await Promise.all([hour.boundingBox(), minute.boundingBox(), period.boundingBox()]);
    const pickerBox = await picker.boundingBox();
    expect(boxes.every(Boolean)).toBe(true);
    expect(pickerBox).toBeTruthy();
    expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
    for (const control of [hour, minute]) {
      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, fontSize: Number.parseFloat(computed.fontSize) };
      });
      expect(style.height).toBeGreaterThanOrEqual(48);
      expect(style.fontSize).toBeGreaterThanOrEqual(16);
    }
    expect(boxes[2]!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("direct time inputs validate without opening option popups", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 320, height: 568 });
  const { editor, picker } = await openTimePicker(page);
  await expect(editor.locator('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
  await expect(picker.locator(".date-time-picker-time select")).toHaveCount(0);
  await expect(picker).toContainText("July 2026");
  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    await expect(picker.getByText(weekday, { exact: true })).toBeVisible();
  }

  const hour = picker.getByRole("textbox", { name: "Hour" });
  await expect(hour).toHaveAttribute("inputmode", "numeric");
  await hour.focus();
  expect(await hour.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
  await hour.click();
  await expect(picker.getByRole("listbox")).toHaveCount(0);
  await expect(hour).not.toHaveAttribute("role", "combobox");
  await hour.fill("11");
  await hour.press("Tab");
  await expect(picker.getByRole("textbox", { name: "Hour" })).toHaveValue("11");
  await picker.getByRole("textbox", { name: "Minute" }).press("ArrowUp");
  await expect(picker.getByRole("textbox", { name: "Minute" })).toHaveValue("01");
  await picker.getByRole("textbox", { name: "Minute" }).press("ArrowDown");
  await expect(picker.getByRole("textbox", { name: "Minute" })).toHaveValue("00");

  const periodControl = picker.getByRole("group", { name: "AM/PM" });
  const currentPeriod = await periodControl.getByRole("button", { pressed: true }).textContent();
  const nextPeriod = currentPeriod === "AM" ? "PM" : "AM";
  await periodControl.getByRole("button", { name: nextPeriod, exact: true }).click();

  const done = picker.getByRole("button", { name: "Done" });
  await done.scrollIntoViewIfNeeded();
  await expect(done).toBeVisible();
  await done.click();
  await expect(editor.getByRole("textbox", { name: "Start" })).toHaveValue(new RegExp(`11:00 ${nextPeriod}$`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await editor.textContent()).not.toMatch(/[\u3400-\u9fff]/);
});

test("24-hour mode keeps Hour and Minute on one readable row", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const { picker } = await openTimePicker(page, "24h");
    const hour = picker.getByRole("textbox", { name: "Hour" });
    const minute = picker.getByRole("textbox", { name: "Minute" });
    const hourBox = await hour.boundingBox();
    const minuteBox = await minute.boundingBox();
    expect(hourBox && minuteBox).toBeTruthy();
    expect(Math.abs(hourBox!.y - minuteBox!.y)).toBeLessThan(2);
    await expect(picker.getByRole("group", { name: "AM/PM" })).toHaveCount(0);
    await hour.fill("23");
    await hour.press("Tab");
    await expect(picker.getByRole("textbox", { name: "Hour" })).toHaveValue("23");
    await hour.fill("24");
    await hour.press("Enter");
    await expect(picker.getByRole("alert")).toContainText("valid hour");
    await hour.fill("0");
    await hour.press("Enter");
    await expect(picker.getByRole("textbox", { name: "Hour" })).toHaveValue("00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("follow system resolves the browser hour cycle and explicit formats override it", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  const { picker } = await openTimePicker(page, "locale");
  const systemUses12Hour = await page.evaluate(() =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 !== false,
  );
  await expect(picker.getByRole("group", { name: "AM/PM" })).toHaveCount(systemUses12Hour ? 1 : 0);

  const explicit24 = await openTimePicker(page, "24h");
  await expect(explicit24.picker.getByRole("group", { name: "AM/PM" })).toHaveCount(0);
  const explicit12 = await openTimePicker(page, "12h");
  await expect(explicit12.picker.getByRole("group", { name: "AM/PM" })).toHaveCount(1);
});

test("switching AM/PM away and back leaves the appointment timestamp unchanged", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await page.goto("/privacy/layout-preview?timeFormat=12h");
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const editor = page.getByRole("dialog", { name: "Create appointment" });
  const start = editor.getByRole("textbox", { name: "Start" });
  const originalValue = await start.inputValue();
  await start.click();
  const picker = editor.getByRole("dialog", { name: "Start picker" });
  const group = picker.getByRole("group", { name: "AM/PM" });
  const originalPeriod = (await group.getByRole("button", { pressed: true }).textContent()) as "AM" | "PM";
  const otherPeriod = originalPeriod === "AM" ? "PM" : "AM";
  await group.getByRole("button", { name: otherPeriod, exact: true }).click();
  await group.getByRole("button", { name: originalPeriod, exact: true }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(start).toHaveValue(originalValue);
});
