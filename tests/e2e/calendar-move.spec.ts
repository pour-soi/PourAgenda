import { expect, test, type Page } from "@playwright/test";
import { cleanupTitles, createLiveAppointment, liveClient, loginPage } from "./live-fixtures";
import { physicalDragToNextDay, physicalResize } from "./pointer-fixtures";

test.use({ trace: "off" });
test.setTimeout(60_000);

export function installPatchFailure(page: Page, shouldFail: () => boolean, didFail: () => void) {
  return page.route("**/rest/v1/appointments*", async (route) => {
    if (route.request().method() === "PATCH" && shouldFail()) {
      didFail();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "forced verification failure" }) });
    } else await route.continue();
  });
}

test("physical resize persists and a failed resize rolls back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Physical resize is verified in desktop Chromium.");
  const client = await liveClient();
  const title = `Physical resize ${Date.now()}`;
  let failNextPatch = false;
  await installPatchFailure(page, () => failNextPatch, () => { failNextPatch = false; });
  try {
    const created = await createLiveAppointment(client, title);
    await loginPage(page);
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    const event = page.locator(`[data-appointment-id="${created.id}"]`);
    await expect(event).toBeVisible();

    await physicalResize(page, event);
    await expect.poll(async () => (await client.from("appointments").select("ends_at").eq("id", created.id).single()).data?.ends_at)
      .not.toBe(created.ends_at);
    const persisted = (await client.from("appointments").select("starts_at,ends_at").eq("id", created.id).single()).data!;
    await page.reload();
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    await expect(event).toBeVisible();

    failNextPatch = true;
    await physicalResize(page, event);
    await expect(page.getByText("PourAgenda could not save that appointment. Check your connection and try again.")).toBeVisible();
    await expect.poll(async () => (await client.from("appointments").select("starts_at,ends_at").eq("id", created.id).single()).data)
      .toEqual(persisted);
    await page.reload();
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    await expect(event).toBeVisible();
  } finally {
    await cleanupTitles(client, [title]);
  }
});

test("physical drag persists and a failed drag rolls back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Physical drag is verified in desktop Chromium.");
  const client = await liveClient();
  const title = `Physical drag ${Date.now()}`;
  let failNextPatch = false;
  await installPatchFailure(page, () => failNextPatch, () => { failNextPatch = false; });
  try {
    const created = await createLiveAppointment(client, title);
    await loginPage(page);
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    const event = page.locator(`[data-appointment-id="${created.id}"]`);
    await expect(event).toBeVisible();
    await expect(event).toHaveClass(/fc-event-draggable/);
    page.on("dialog", (dialog) => void dialog.accept());

    await physicalDragToNextDay(event);
    await expect.poll(async () => (await client.from("appointments").select("starts_at").eq("id", created.id).single()).data?.starts_at)
      .not.toBe(created.starts_at);
    const persisted = (await client.from("appointments").select("starts_at,ends_at").eq("id", created.id).single()).data!;
    await page.reload();
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    await expect(event).toBeVisible();

    failNextPatch = true;
    await physicalDragToNextDay(event);
    await page.waitForTimeout(500);
    if (failNextPatch) await physicalDragToNextDay(event);
    await expect(page.getByText("PourAgenda could not save that appointment. Check your connection and try again.")).toBeVisible();
    await expect.poll(async () => (await client.from("appointments").select("starts_at,ends_at").eq("id", created.id).single()).data)
      .toEqual(persisted);
    await page.reload();
    await page.locator(".fc").getByRole("button", { name: "Week", exact: true }).click();
    await expect(event).toBeVisible();
  } finally {
    await cleanupTitles(client, [title]);
  }
});
