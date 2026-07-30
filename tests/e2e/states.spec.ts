import { expect, test } from "@playwright/test";
import { loginPage } from "./live-fixtures";

test.use({ trace: "off" });

test("loading, list error recovery, and offline write blocking are explicit", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One deterministic state run is sufficient.");
  let releaseInitialLoad: (() => void) | undefined;
  const initialLoadReleased = new Promise<void>((resolve) => { releaseInitialLoad = resolve; });
  let delayInitialLoad = true;
  await page.route("**/rest/v1/appointments*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (delayInitialLoad) {
      delayInitialLoad = false;
      await initialLoadReleased;
      return route.continue();
    }
    return route.continue();
  });

  await loginPage(page);
  await expect(page.getByText("Loading appointments…")).toBeVisible();
  releaseInitialLoad?.();
  await expect(page.getByRole("button", { name: "Week" })).toBeVisible();
  await expect(page.getByText("Refreshing…")).toHaveCount(0);

  await page.unroute("**/rest/v1/appointments*");
  let failedListRequests = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === "/rest/v1/appointments") {
      failedListRequests += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary network failure" }),
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Appointment lists" }).click();
  await expect.poll(() => failedListRequests).toBeGreaterThan(0);
  const list = page.getByRole("region", { name: "Upcoming appointments" });
  await expect(list.getByRole("alert")).toContainText("could not be loaded", { timeout: 12_000 });
  await page.unroute("**/*");
  await list.getByRole("button", { name: "Retry" }).click();
  await expect(list.getByRole("alert")).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await page.getByRole("button", { name: "New appointment" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Create appointment" });
  await dialog.getByLabel("Title").fill("Unsaved offline draft");
  await dialog.getByRole("button", { name: "Save appointment" }).click();
  await expect(dialog.getByText("Reconnect before saving this appointment.")).toBeVisible();
  await expect(dialog).toBeVisible();
  await context.setOffline(false);
});
