import { expect, test, type Page } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks } from "./calendar-layout-fixtures";

async function openTimePicker(page: Page, timeFormat: "12h" | "24h" = "12h") {
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await page.goto(`/privacy/layout-preview${timeFormat === "24h" ? "?timeFormat=24h" : ""}`);
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const editor = page.getByRole("dialog", { name: "Create appointment" });
  await editor.getByLabel("Start").click();
  return {
    editor,
    picker: editor.getByRole("dialog", { name: "Start picker" }),
  };
}

test("custom time controls remain readable on one row across the responsive matrix", async ({ page }) => {
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
    const hour = picker.getByRole("combobox", { name: "Hour" });
    const minute = picker.getByRole("combobox", { name: "Minute" });
    const period = picker.getByRole("combobox", { name: "AM/PM" });
    const boxes = await Promise.all([hour.boundingBox(), minute.boundingBox(), period.boundingBox()]);
    const pickerBox = await picker.boundingBox();
    expect(boxes.every(Boolean)).toBe(true);
    expect(pickerBox).toBeTruthy();
    expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))).toBeLessThan(2);
    for (const control of [hour, minute, period]) {
      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, fontSize: Number.parseFloat(computed.fontSize) };
      });
      expect(style.height).toBeGreaterThanOrEqual(48);
      expect(style.fontSize).toBeGreaterThanOrEqual(16);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("custom listboxes support readable options, numeric entry, and keyboard selection", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 320, height: 568 });
  const { editor, picker } = await openTimePicker(page);
  await expect(editor.locator('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
  await expect(picker.locator(".date-time-picker-time select")).toHaveCount(0);
  await expect(picker).toContainText("July 2026");
  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    await expect(picker.getByText(weekday, { exact: true })).toBeVisible();
  }

  const hour = picker.getByRole("combobox", { name: "Hour" });
  await expect(hour).toHaveAttribute("inputmode", "numeric");
  await hour.focus();
  expect(await hour.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
  await hour.click();
  const hourOptions = picker.getByRole("listbox", { name: "Hour options" });
  const firstOption = hourOptions.getByRole("option").first();
  const optionStyle = await firstOption.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, fontSize: Number.parseFloat(computed.fontSize) };
  });
  expect(optionStyle.height).toBeGreaterThanOrEqual(44);
  expect(optionStyle.fontSize).toBeGreaterThanOrEqual(17);
  await expect(hourOptions.getByRole("option", { selected: true })).toHaveCount(1);
  const hoverOption = hourOptions.getByRole("option").nth(1);
  const beforeHover = await hoverOption.evaluate((element) => getComputedStyle(element).backgroundColor);
  await hoverOption.hover();
  expect(await hoverOption.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(beforeHover);
  await hour.press("Escape");
  await hour.fill("11");
  await hour.press("Tab");
  await expect(picker.getByRole("combobox", { name: "Hour" })).toHaveValue("11");
  await picker.getByRole("combobox", { name: "Minute" }).press("ArrowDown");
  await picker.getByRole("combobox", { name: "Minute" }).press("Enter");
  await expect(picker.getByRole("combobox", { name: "Minute" })).toHaveValue("01");
  await picker.getByRole("combobox", { name: "Minute" }).press("ArrowUp");
  await picker.getByRole("combobox", { name: "Minute" }).press("Enter");
  await expect(picker.getByRole("combobox", { name: "Minute" })).toHaveValue("00");

  const period = picker.getByRole("combobox", { name: "AM/PM" });
  const nextPeriod = await period.inputValue() === "AM" ? "PM" : "AM";
  await period.click();
  await picker.getByRole("listbox", { name: "AM/PM options" }).getByRole("option", { name: nextPeriod }).click();
  await expect(picker.getByRole("combobox", { name: "AM/PM" })).toHaveValue(nextPeriod);

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
    const hour = picker.getByRole("combobox", { name: "Hour" });
    const minute = picker.getByRole("combobox", { name: "Minute" });
    const hourBox = await hour.boundingBox();
    const minuteBox = await minute.boundingBox();
    expect(hourBox && minuteBox).toBeTruthy();
    expect(Math.abs(hourBox!.y - minuteBox!.y)).toBeLessThan(2);
    await expect(picker.getByRole("combobox", { name: "AM/PM" })).toHaveCount(0);
    await hour.fill("23");
    await hour.press("Tab");
    await expect(picker.getByRole("combobox", { name: "Hour" })).toHaveValue("23");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
