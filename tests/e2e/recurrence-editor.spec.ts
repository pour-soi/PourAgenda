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
    const occurrence = page.locator(`[data-appointment-id^="${parent.id}:"]`).first();
    await occurrence.click({ force: true });
    await page.getByRole("dialog", { name: "Edit recurring appointment" }).getByRole("button", { name: "Entire series" }).click();
    const editor = page.getByRole("dialog", { name: "Edit appointment" });
    await expect(editor.getByLabel("Repeat pattern")).toHaveValue("weekly");
    await expect(editor.getByText("Repeat on")).toBeVisible();
    await expect(editor.getByText("Summary")).toBeVisible();
    await expect(editor.getByText("Upcoming")).toBeVisible();
    const more = editor.getByRole("button", { name: /More actions for/ }).first();
    await more.click();
    await expect(editor.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor.getByRole("menu")).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await editor.getByRole("menuitem", { name: "Skip this occurrence" }).click();
    await expect.poll(async () => (await client.from("appointments").select("status").eq("series_id", parent.id)).data)
      .toContainEqual({ status: "cancelled" });
    await expect(editor.getByText("skipped", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: /More actions for/ }).first().click();
    await editor.getByRole("menuitem", { name: "Restore occurrence" }).click();
    await expect.poll(async () => (await client.from("appointments").select("id").eq("series_id", parent.id)).data).toHaveLength(0);
    await editor.getByRole("button", { name: /More actions for/ }).first().click();
    await editor.getByRole("menuitem", { name: "Edit only this occurrence" }).click();
    await expect(page.getByRole("dialog", { name: "Edit appointment" }).getByText("Editing this occurrence only")).toBeVisible();
  } finally {
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
  }
});
