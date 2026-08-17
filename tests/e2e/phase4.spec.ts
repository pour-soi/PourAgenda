import { expect, test } from "@playwright/test";
import { liveClient, loginPage } from "./live-fixtures";

test("contacts remain usable without horizontal overflow", async ({ page }) => {
  await loginPage(page);
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await page.getByRole("button", { name: "New contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Create contact" });
  await expect(dialog.getByLabel("Phone")).toHaveAttribute("type", "tel");
  await expect(dialog.getByLabel("Email")).toHaveAttribute("type", "email");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("Phase 4 controls remain accessible and responsive", async ({ page }) => {
  await loginPage(page);
  await page.goto("/settings");
  for (const name of ["At start time", "10 minutes before", "30 minutes before", "1 hour before", "1 day before"]) {
    await expect(page.getByLabel(name)).toBeVisible();
  }
  for (const name of ["Export appointments CSV", "Export calendar ICS", "Export contacts CSV", "Export settings JSON", "Delete account permanently"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Export appointments CSV" }).focus();
  await expect(page.getByRole("button", { name: "Export appointments CSV" })).toBeFocused();
  const minimumTarget = await page.getByRole("button", { name: "Delete account permanently" }).evaluate((element) =>
    Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height),
  );
  expect(minimumTarget).toBeGreaterThanOrEqual(40);

  await page.goto("/");
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const appointment = page.getByRole("dialog");
  await expect(appointment.getByLabel("Contact")).toHaveCount(0);
  await expect(appointment.getByText("Public read-only sharing")).toHaveCount(0);
  await expect(appointment.getByText("No active sharing link.")).toHaveCount(0);
  await expect(appointment.getByRole("button", { name: "Create sharing link" })).toHaveCount(0);
  await expect(appointment.getByLabel("Show public notes")).toHaveCount(0);
  await expect(appointment.getByLabel("Notes")).toBeVisible();
  await expect(appointment.getByRole("group", { name: "Reminders" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await appointment.getByRole("button", { name: "Close" }).click();
  await page.close();
});

test("contact actions create bounded owner activity history", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Live activity mutation runs once in desktop Chromium.");
  const client = await liveClient("A");
  const startedAt = new Date().toISOString();
  const name = `Activity contact ${Date.now()}`;
  try {
    await loginPage(page);
    await page.goto("/contacts");
    await page.getByRole("button", { name: "New contact" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Contact created.")).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: name });
    await card.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Company or organization").fill("Verification");
    await page.getByRole("dialog").getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Contact updated.")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page.getByText("Contact deleted. Linked appointments were kept.")).toBeVisible();
    await expect.poll(async () =>
      (await client.from("appointment_activity").select("action,occurred_at")
        .gte("occurred_at", startedAt).in("action", ["contact_created", "contact_updated", "contact_deleted"])
        .order("occurred_at", { ascending: true }).limit(10)).data,
    ).toHaveLength(3);
    const activities = (await client.from("appointment_activity").select("action,occurred_at")
      .gte("occurred_at", startedAt).in("action", ["contact_created", "contact_updated", "contact_deleted"])
      .order("occurred_at", { ascending: true }).limit(10)).data!;
    expect(activities.map((row) => row.action)).toEqual(["contact_created", "contact_updated", "contact_deleted"]);
    expect(activities.every((row) => Boolean(row.occurred_at))).toBe(true);
  } finally {
    await client.from("contacts").delete().eq("name", name);
    await client.from("appointment_activity").delete().gte("occurred_at", startedAt)
      .in("action", ["contact_created", "contact_updated", "contact_deleted"]);
    await client.auth.signOut();
  }
});
