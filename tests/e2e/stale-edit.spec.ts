import { expect, test } from "@playwright/test";
import { cleanupTitles, createLiveAppointment, liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(60_000);

async function openFromUpcoming(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("button", { name: "Appointment lists" }).click();
  await page.getByLabel("Search appointments").fill(title);
  await page.getByRole("region", { name: "Upcoming appointments" }).getByText(title, { exact: true }).click();
}

test("a stale browser edit is rejected and can reload without losing local form values", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One real two-tab concurrency run is sufficient.");
  const client = await liveClient();
  const title = `Stale base ${Date.now()}`;
  const firstTitle = `${title} first`;
  const localDraft = `${title} local draft`;
  const secondPage = await context.newPage();
  try {
    await createLiveAppointment(client, title);
    await loginPage(page);
    await secondPage.goto("/");
    await secondPage.getByRole("heading", { name: "Your calendar" }).waitFor();
    await Promise.all([openFromUpcoming(page, title), openFromUpcoming(secondPage, title)]);

    await secondPage.getByRole("dialog").getByLabel("Title").fill(localDraft);
    await page.getByRole("dialog").getByLabel("Title").fill(firstTitle);
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await secondPage.getByRole("button", { name: "Save appointment" }).click();
    await expect(secondPage.getByRole("dialog").getByText("This appointment was changed on another device. Reload the latest version before saving.")).toBeVisible();
    await secondPage.getByRole("button", { name: "Reload latest appointment" }).click();
    await expect(secondPage.getByRole("dialog").getByText("Latest version loaded. Your unsaved form values are preserved.")).toBeVisible();
    await expect(secondPage.getByRole("dialog").getByLabel("Title")).toHaveValue(localDraft);
    await secondPage.getByRole("button", { name: "Save appointment" }).click();
    await expect(secondPage.getByRole("dialog")).toBeHidden();
    const { data } = await client.from("appointments").select("title").in("title", [title, firstTitle, localDraft]);
    expect(data?.map((item) => item.title)).toEqual([localDraft]);
  } finally {
    await cleanupTitles(client, [title, firstTitle, localDraft]);
    await secondPage.close();
  }
});
