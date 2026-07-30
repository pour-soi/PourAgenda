import { expect, test } from "@playwright/test";
import { cleanupTitles, createLiveAppointment, liveClient, loginPage } from "./live-fixtures";
import { toLocalInput } from "../../src/lib/appointments";

test.use({ trace: "off" });
test.setTimeout(60_000);

test("conflicts require an explicit override while cancelled rows are ignored", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One authenticated conflict flow is sufficient.");
  const client = await liveClient();
  const baseTitle = `Conflict base ${Date.now()}`;
  const overrideTitle = `Conflict override ${Date.now()}`;
  const cancelledTitle = `Cancelled conflict ${Date.now()}`;
  const ignoredTitle = `Cancelled ignored ${Date.now()}`;
  try {
    const base = await createLiveAppointment(client, baseTitle);
    const timezone = (await client.from("user_settings").select("timezone").single()).data!.timezone;
    await loginPage(page);
    await page.getByRole("button", { name: "New appointment" }).last().click();
    let dialog = page.getByRole("dialog", { name: "Create appointment" });
    await dialog.getByLabel("Title").fill(overrideTitle);
    await dialog.getByLabel("Start").fill(toLocalInput(base.starts_at, timezone));
    await dialog.getByRole("textbox", { name: "End", exact: true }).fill(toLocalInput(base.ends_at, timezone));
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog.getByText("Time conflict")).toBeVisible();
    await expect(dialog.getByText(new RegExp(baseTitle))).toBeVisible();
    await dialog.getByLabel("Location").fill("Reviewed conflict");
    await dialog.getByRole("button", { name: "Save anyway" }).click();
    await expect(dialog).toBeHidden();
    const { data: overridden } = await client.from("appointments").select("id").eq("title", overrideTitle);
    expect(overridden).toHaveLength(1);

    await createLiveAppointment(client, cancelledTitle, { starts_at: base.starts_at, ends_at: base.ends_at, status: "cancelled", cancelled_at: new Date().toISOString() });
    await client.from("appointments").delete().in("title", [baseTitle, overrideTitle]);
    await page.getByRole("button", { name: "New appointment" }).last().click();
    dialog = page.getByRole("dialog", { name: "Create appointment" });
    await dialog.getByLabel("Title").fill(ignoredTitle);
    await dialog.getByLabel("Start").fill(toLocalInput(base.starts_at, timezone));
    await dialog.getByRole("textbox", { name: "End", exact: true }).fill(toLocalInput(base.ends_at, timezone));
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect.poll(async () => {
      const { data } = await client.from("appointments").select("id").eq("title", ignoredTitle);
      return data?.length;
    }).toBe(1);
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  } finally {
    await cleanupTitles(client, [baseTitle, overrideTitle, cancelledTitle, ignoredTitle]);
  }
});
