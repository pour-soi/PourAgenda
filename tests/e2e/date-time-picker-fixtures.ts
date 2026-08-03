import type { Locator } from "@playwright/test";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function fillDateTimePicker(field: Locator, value: string) {
  const [dateKey, time] = value.split("T");
  const label = await field.getAttribute("aria-label");
  if (!label) throw new Error("Date/time picker compatibility field has no label.");
  const root = field.locator("..");
  await root.getByRole("button", { name: `Choose ${label.toLowerCase()} date` }).click();
  const dateDialog = root.getByRole("dialog", { name: `${label} date picker` });
  const [year, month, day] = dateKey.split("-").map(Number);
  for (let index = 0; index < 240; index += 1) {
    const heading = (await dateDialog.locator(".date-time-picker-month strong").textContent()) ?? "";
    const [monthName, visibleYear] = heading.split(" ");
    const current = Number(visibleYear) * 12 + monthNames.indexOf(monthName);
    const target = year * 12 + month - 1;
    if (current === target) break;
    await dateDialog.getByRole("button", { name: current < target ? "Next month" : "Previous month" }).click();
  }
  await dateDialog.getByRole("button", { name: String(day), exact: true }).click();
  await dateDialog.getByRole("button", { name: "Done" }).click();
  if (!time) return;
  await root.getByRole("button", { name: `Choose ${label.toLowerCase()} time` }).click();
  const timeDialog = root.getByRole("dialog", { name: `${label} time picker` });
  const [hourText, minuteText] = time.split(":");
  const hour24 = Number(hourText);
  if (await timeDialog.getByRole("group", { name: "AM/PM" }).count()) {
    await timeDialog.getByLabel(`${label} hour`).selectOption(String(hour24 % 12 || 12));
    await timeDialog.getByRole("button", { name: hour24 < 12 ? "AM" : "PM", exact: true }).click();
  } else {
    await timeDialog.getByLabel(`${label} hour`).selectOption(String(hour24));
  }
  await timeDialog.getByLabel(`${label} minute`).selectOption(String(Number(minuteText)));
  await timeDialog.getByRole("button", { name: "Done" }).click();
}
