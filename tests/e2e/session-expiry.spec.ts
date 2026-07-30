import { expect, test } from "@playwright/test";
import { liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });

test("a genuinely invalidated browser session is rejected by Supabase and gets recovery guidance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One live Chromium session invalidation is sufficient.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The mutation hook is intentionally excluded from production.");
  const title = `Expired session ${Date.now()}`;
  try {
    await loginPage(page);
    await page.getByRole("button", { name: "New appointment" }).last().click();
    const dialog = page.getByRole("dialog", { name: "Create appointment" });
    await dialog.getByLabel("Title").fill(title);

    const rejectedWrite = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/rest/v1/appointments") &&
      response.status() >= 400,
    );
    await page.evaluate(() => window.__pourAgendaInvalidateSession?.());
    await dialog.getByRole("button", { name: "Save appointment" }).click();

    const response = await rejectedWrite;
    expect(response.status()).toBeGreaterThanOrEqual(400);
    await expect(dialog.getByText("Your session expired. Sign in again before saving.")).toBeVisible();
    await expect(dialog).toBeVisible();
  } finally {
    const client = await liveClient();
    await client.from("appointments").delete().eq("title", title);
    await client.auth.signOut();
  }
});

test("production session loss redirects a protected route to recovery", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || !process.env.PLAYWRIGHT_BASE_URL,
    "Production protected-route recovery runs once in desktop Chromium.");
  await loginPage(page);
  await context.clearCookies();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
