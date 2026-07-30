import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const parseEnvironmentFile = (path: string) => Object.fromEntries(
  fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);
const appEnvironment = parseEnvironmentFile(".env.local");
const testEnvironment = parseEnvironmentFile(".env.rls-test");
const testValue = (key: string) => process.env[key] ?? testEnvironment[key];

test.use({ trace: "off" });
test.setTimeout(60_000);

test("authenticated appointment create, view, edit, and delete", async ({ page }, testInfo) => {
  const title = `E2E ${testInfo.project.name} ${Date.now()}`;
  const editedTitle = `${title} edited`;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(testValue("POURAGENDA_TEST_USER_A_EMAIL"));
    await page.getByLabel("Password").fill(testValue("POURAGENDA_TEST_USER_A_PASSWORD"));
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Your calendar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Month", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "New appointment" }).last().click();
    const appointmentDialog = page.getByRole("dialog");
    await appointmentDialog.getByLabel("Title").fill(title, { timeout: 5_000 });
    await appointmentDialog.getByLabel("Location").fill("Phase 2 verification", { timeout: 5_000 });
    const invalidFields = await appointmentDialog.locator("form").evaluate((form) =>
      Array.from((form as HTMLFormElement).elements)
        .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
        .filter((element) => !element.checkValidity())
        .map((element) => element.getAttribute("aria-label") || element.getAttribute("name") || element.id || element.tagName),
    );
    expect(invalidFields).toEqual([]);
    await page.getByRole("button", { name: "Save appointment" }).click({ timeout: 5_000 });
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

    await page.getByText(title, { exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Title").fill(editedTitle);
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByText(editedTitle, { exact: true }).first()).toBeVisible();

    await page.getByText(editedTitle, { exact: true }).first().click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
  } finally {
    await Promise.race([
      (async () => {
        const supabase = createClient(
          appEnvironment.NEXT_PUBLIC_SUPABASE_URL,
          appEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        await supabase.auth.signInWithPassword({
          email: testValue("POURAGENDA_TEST_USER_A_EMAIL"),
          password: testValue("POURAGENDA_TEST_USER_A_PASSWORD"),
        });
        await supabase.from("appointments").delete().in("title", [title, editedTitle]);
        await supabase.auth.signOut();
      })(),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
});
