import { expect, test } from "@playwright/test";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(120_000);

test("compact recurrence editor skips, restores, and opens occurrence-only editing", async ({ page }) => {
  const client = await liveClient();
  const title = `Recurrence editor ${Date.now()}`;
  const start = new Date(Date.now() + 2 * 864e5); start.setUTCHours(17, 0, 0, 0);
  const parent = await createLiveAppointment(client, title, {
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600_000).toISOString(),
    intended_local_start: start.toISOString().slice(0, 19).replace("T", " "),
    intended_local_end: new Date(start.getTime() + 3600_000).toISOString().slice(0, 19).replace("T", " "),
    recurrence_frequency: "weekly", recurrence_interval: 1,
    recurrence_until: new Date(start.getTime() + 35 * 864e5).toISOString().slice(0, 10),
  });
  try {
    await loginPage(page);
    let unsavedOccurrenceWrites = 0;
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/appointments") && request.method() !== "GET") unsavedOccurrenceWrites += 1;
    });
    await page.getByRole("button", { name: "New appointment" }).last().click();
    const unsaved = page.getByRole("dialog", { name: "Create appointment" });
    await unsaved.getByLabel("Repeat pattern").selectOption("weekly");
    await expect(unsaved.getByText("Save the series before managing individual occurrences.")).toBeVisible();
    await expect(unsaved.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
    expect(unsavedOccurrenceWrites).toBe(0);
    await unsaved.getByRole("button", { name: "Close" }).click();
    const occurrence = page.locator(`[data-appointment-id^="${parent.id}:"]`).first();
    await occurrence.click({ force: true });
    await page.getByRole("dialog", { name: "Edit recurring appointment" }).getByRole("button", { name: "Entire series" }).click();
    const editor = page.getByRole("dialog", { name: "Edit appointment" });
    await expect(editor.getByLabel("Repeat pattern")).toHaveValue("weekly");
    await expect(editor.getByText("Repeat on")).toBeVisible();
    await expect(editor.getByText("Summary")).toBeVisible();
    await expect(editor.getByText("Upcoming")).toBeVisible();
    const repeat = editor.getByRole("group", { name: "Repeat" });
    await expect(repeat.getByText("Date", { exact: true })).toHaveCount(0);
    await expect(editor.getByRole("textbox", { name: "Repeat end date" })).toBeAttached();
    const endsControl = repeat.locator('[data-recurrence-control="ends"]');
    const endDateControl = repeat.locator('[data-recurrence-control="end-date"]');
    const endsBox = await endsControl.getByRole("combobox").boundingBox();
    const endDateBox = await endDateControl.getByRole("button", { name: "Choose repeat end date" }).boundingBox();
    expect(endsBox?.height).toBeGreaterThanOrEqual(44);
    expect(endDateBox?.height).toBeGreaterThanOrEqual(44);
    if ((page.viewportSize()?.width ?? 0) >= 600) expect(Math.abs((endsBox?.y ?? 0) - (endDateBox?.y ?? 0))).toBeLessThanOrEqual(2);
    else expect((endDateBox?.y ?? 0)).toBeGreaterThan((endsBox?.y ?? 0));
    const more = editor.getByRole("button", { name: /^Actions for/ });
    await expect(more).toHaveCount(5);
    for (const trigger of await more.all()) {
      const box = await trigger.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const second = more.nth(1);
    await second.focus(); await page.keyboard.press("Enter");
    await expect(editor.getByRole("menu")).toBeVisible();
    await page.keyboard.press("End");
    await expect(editor.getByRole("menuitem", { name: "Move this occurrence" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(second).toBeFocused();
    await second.focus(); await page.keyboard.press("Space");
    await expect(editor.getByRole("menu")).toBeVisible();
    const menuBox = await editor.getByRole("menu").boundingBox();
    const viewport = page.viewportSize();
    expect(menuBox?.x).toBeGreaterThanOrEqual(0); expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    await editor.getByRole("heading", { name: "Appointment details" }).click();
    await expect(editor.getByRole("menu")).toBeHidden();
    await expect(second).toBeFocused();
    const rows = repeat.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    const secondOriginal = await rows.nth(1).getAttribute("data-original-occurrence-start");
    expect(secondOriginal).toBeTruthy();
    await second.click();
    await editor.getByRole("menuitem", { name: "Skip this occurrence" }).click();
    await expect.poll(async () => (await client.from("appointments").select("status,original_occurrence_start").eq("series_id", parent.id)).data
      ?.map((row) => ({ ...row, original_occurrence_start: new Date(row.original_occurrence_start).toISOString() })))
      .toEqual([{ status: "cancelled", original_occurrence_start: secondOriginal }]);
    await expect(rows.nth(1)).toHaveAttribute("data-occurrence-state", "skipped");
    await expect(rows.nth(0)).toHaveAttribute("data-occurrence-state", "normal");
    await expect(rows.nth(2)).toHaveAttribute("data-occurrence-state", "normal");
    await expect(rows.nth(3)).toHaveAttribute("data-occurrence-state", "normal");
    await expect(rows.nth(4)).toHaveAttribute("data-occurrence-state", "normal");
    await expect(second).toBeFocused();
    const persistedParent = (await client.from("appointments").select("recurrence_frequency,recurrence_interval").eq("id", parent.id).single()).data;
    expect(persistedParent).toEqual({ recurrence_frequency: "weekly", recurrence_interval: 1 });
    await second.click();
    await editor.getByRole("menuitem", { name: "Restore occurrence" }).click();
    await expect.poll(async () => (await client.from("appointments").select("id").eq("series_id", parent.id)).data).toHaveLength(0);
    await expect(rows.nth(1)).toHaveAttribute("data-occurrence-state", "normal");
    await expect(second).toBeFocused();
    await more.first().click();
    await editor.getByRole("menuitem", { name: "Edit only this occurrence" }).click();
    await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByText("Editing this occurrence only")).toBeVisible();
  } finally {
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
  }
});
