import type { Locator } from "@playwright/test";

function displayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${month}/${day}/${year}`;
}

export async function fillDateTimePicker(field: Locator, value: string) {
  const [dateKey, time] = value.split("T");
  if (!time) {
    await field.fill(displayDate(dateKey));
    await field.press("Tab");
    return;
  }
  const current = await field.inputValue();
  const [hourText, minute] = time.split(":");
  const hour24 = Number(hourText);
  const formattedTime = /\b(?:AM|PM)\b/.test(current)
    ? `${hour24 % 12 || 12}:${minute} ${hour24 < 12 ? "AM" : "PM"}`
    : `${hourText}:${minute}`;
  await field.fill(`${displayDate(dateKey)} ${formattedTime}`);
  await field.press("Tab");
}
