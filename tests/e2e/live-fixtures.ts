import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const parse = (path: string) => Object.fromEntries(
  fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);
const app = parse(".env.local");
const users = parse(".env.rls-test");
const userValue = (key: string) => process.env[key] ?? users[key];

export async function loginPage(page: Page, user: "A" | "B" = "A") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userValue(`POURAGENDA_TEST_USER_${user}_EMAIL`));
  await page.getByLabel("Password").fill(userValue(`POURAGENDA_TEST_USER_${user}_PASSWORD`));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
}

export async function liveClient(user: "A" | "B" = "A"): Promise<SupabaseClient> {
  const client = createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({
    email: userValue(`POURAGENDA_TEST_USER_${user}_EMAIL`),
    password: userValue(`POURAGENDA_TEST_USER_${user}_PASSWORD`),
  });
  if (error) throw new Error("Disposable test account authentication failed.");
  return client;
}

export async function createLiveAppointment(
  client: SupabaseClient,
  title: string,
  overrides: Record<string, unknown> = {},
) {
  const { data: auth } = await client.auth.getUser();
  const { data: category, error: categoryError } = await client.from("categories").select("id").limit(1).single();
  if (categoryError || !category || !auth.user) throw new Error("Disposable account bootstrap data is unavailable.");
  const start = new Date(Date.now() + 2 * 864e5);
  start.setUTCHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  const payload = {
    user_id: auth.user.id, category_id: category.id, title, kind: "work",
    starts_at: start.toISOString(), ends_at: end.toISOString(), timezone: "UTC",
    intended_local_start: start.toISOString().slice(0, 19).replace("T", " "),
    intended_local_end: end.toISOString().slice(0, 19).replace("T", " "),
    all_day: false, ...overrides,
  };
  const { data, error } = await client.from("appointments").insert(payload).select("*").single();
  if (error) throw new Error("Live appointment setup failed.");
  return data;
}

export async function cleanupTitles(client: SupabaseClient, titles: string[]) {
  await client.from("appointments").delete().in("title", titles);
  await client.auth.signOut();
}

export function localInput(iso: string) {
  return iso.slice(0, 16);
}
