import { expect, test, type Page } from "@playwright/test";
import { createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(90_000);

async function openOccurrence(page: Page, parentId: string) {
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const occurrence = page.locator(`[data-appointment-id^="${parentId}:"]`).first();
  await expect(occurrence).toBeVisible();
  await occurrence.click();
  await expect(page.getByRole("dialog", { name: "Edit appointment" })).toBeVisible();
}

test("two independent contexts reject stale entire-series and occurrence edits", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-context concurrency runs once in desktop Chromium.");
  const client = await liveClient();
  const title = `Recurring contexts ${Date.now()}`;
  const parent = await createLiveAppointment(client, title, {
    recurrence_frequency: "daily", recurrence_interval: 1,
    recurrence_until: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
  });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await Promise.all([loginPage(pageA), loginPage(pageB)]);

    await Promise.all([openOccurrence(pageA, parent.id), openOccurrence(pageB, parent.id)]);
    await pageA.getByRole("dialog").getByLabel("Location").fill("Series change from context A");
    await pageB.getByRole("dialog").getByLabel("Location").fill("Unsaved series change from context B");
    await pageA.getByRole("dialog").getByRole("button", { name: "Save appointment" }).click();
    await pageA.getByRole("dialog", { name: "Save recurring appointment" }).getByRole("button", { name: "Entire series" }).click();
    await expect(pageA.getByRole("dialog")).toBeHidden();
    await pageB.getByRole("dialog").getByRole("button", { name: "Save appointment" }).click();
    await pageB.getByRole("dialog", { name: "Save recurring appointment" }).getByRole("button", { name: "Entire series" }).click();
    await expect(pageB.getByRole("dialog").getByText("This appointment was changed on another device. Reload the latest version before saving.")).toBeVisible();
    await pageB.getByRole("button", { name: "Reload latest appointment" }).click();
    await expect(pageB.getByRole("dialog").getByText("Latest version loaded. Your unsaved form values are preserved.")).toBeVisible();
    await expect(pageB.getByRole("dialog").getByLabel("Location")).toHaveValue("Unsaved series change from context B");
    expect((await client.from("appointments").select("location").eq("id", parent.id).single()).data?.location)
      .toBe("Series change from context A");

    await Promise.all([pageA.reload(), pageB.reload()]);
    await Promise.all([openOccurrence(pageA, parent.id), openOccurrence(pageB, parent.id)]);
    const exceptionA = `${title} exception A`;
    const exceptionB = `${title} exception B`;
    await pageA.getByRole("dialog").getByLabel("Title").fill(exceptionA);
    await pageB.getByRole("dialog").getByLabel("Title").fill(exceptionB);
    await pageA.getByRole("dialog").getByRole("button", { name: "Save appointment" }).click();
    await pageA.getByRole("dialog", { name: "Save recurring appointment" }).getByRole("button", { name: "This appointment only" }).click();
    await expect(pageA.getByRole("dialog")).toBeHidden();
    await pageB.getByRole("dialog").getByRole("button", { name: "Save appointment" }).click();
    await pageB.getByRole("dialog", { name: "Save recurring appointment" }).getByRole("button", { name: "This appointment only" }).click();
    await expect(pageB.getByRole("dialog").getByText("This occurrence changed on another device. Reload the latest version before saving.")).toBeVisible();
    await pageB.getByRole("button", { name: "Reload latest appointment" }).click();
    await expect(pageB.getByRole("dialog").getByText("Latest version loaded. Your unsaved form values are preserved.")).toBeVisible();
    await expect(pageB.getByRole("dialog").getByLabel("Title")).toHaveValue(exceptionB);
    const exceptions = await client.from("appointments").select("title").eq("series_id", parent.id);
    expect(exceptions.data?.map((row) => row.title)).toEqual([exceptionA]);
  } finally {
    await client.from("appointments").delete().eq("id", parent.id);
    await client.auth.signOut();
    await contextA.close();
    await contextB.close();
  }
});
