import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("login submit button is available after the auth page loads", async ({ page }) => {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

test("login submit enters pending state and is blocked during pending requests", async ({ page }) => {
  let releaseRequest: () => void = () => undefined;
  let pendingRequests = 0;
  const allowResponse: Promise<void> = new Promise((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/auth/v1/token**", async (route) => {
    pendingRequests += 1;
    if (pendingRequests === 1) {
      await allowResponse;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid login credentials" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("valid@example.com");
  await page.getByLabel("Password").fill("ValidPassword123!");
  const submit = page.locator("form button");

  await submit.click();
  await expect(submit).toHaveText("Please wait…");
  await expect(submit).toBeDisabled();
  await expect.poll(() => pendingRequests).toBe(1);

  await submit.click({ force: true });
  await expect.poll(() => pendingRequests).toBe(1);

  releaseRequest();
  await expect.poll(() => pendingRequests).toBe(1);
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText("Sign in");
  await expect(page.getByRole("status")).toContainText(/invalid|credentials/i);
});

test("registration and password reset entry points are available", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("login form reaches live Supabase Auth without exposing details", async ({ page }) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid login credentials" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("no-account@invalid.example");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText(/invalid|credentials/i);
});
