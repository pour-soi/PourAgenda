import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("registration and password reset entry points are available", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("login form reaches live Supabase Auth without exposing details", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("no-account@invalid.example");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText(/invalid|credentials/i);
});
