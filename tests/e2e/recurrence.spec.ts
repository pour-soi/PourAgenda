import { expect, test } from "@playwright/test";
import { liveClient, loginPage } from "./live-fixtures";

test.use({ trace: "off" });
test.setTimeout(90_000);

test("daily series supports occurrence exceptions, cancellation, series concurrency, and cascade deletion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The full recurring mutation flow runs once in desktop Chromium.");
  const client = await liveClient();
  const title = `Recurring E2E ${Date.now()}`;
  const exceptionTitle = `${title} moved`;
  const seriesTitle = `${title} series`;
  let parentId: string | undefined;
  try {
    await loginPage(page);
    await page.getByRole("button", { name: "New appointment" }).last().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Repeat pattern").selectOption("daily");
    await dialog.getByLabel("Repeat ending").selectOption("date");
    const end = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    await dialog.getByLabel("Repeat end date").fill(end);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect(dialog).toBeHidden();

    const parent = await expect.poll(async () =>
      (await client.from("appointments").select("*").eq("title", title).is("series_id", null).maybeSingle()).data,
    ).not.toBeNull();
    const parentRow = (await client.from("appointments").select("*").eq("title", title).single()).data!;
    parentId = parentRow.id;
    await page.reload();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    const rendered = page.locator(`[data-appointment-id^="${parentId}:"]`);
    await expect(rendered.first()).toBeVisible();

    page.once("dialog", (scope) => scope.accept());
    await rendered.first().click();
    await expect(dialog.getByText("Editing this occurrence only")).toBeVisible();
    await dialog.getByLabel("Title").fill(exceptionTitle);
    await dialog.getByRole("button", { name: "Save appointment" }).click();
    await expect.poll(async () =>
      (await client.from("appointments").select("id").eq("series_id", parentId!).eq("title", exceptionTitle)).data?.length,
    ).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByText(exceptionTitle, { exact: true }).first()).toBeVisible();

    const normalOccurrence = page.locator(`[data-appointment-id^="${parentId}:"]`).filter({ hasNotText: exceptionTitle }).first();
    page.once("dialog", (scope) => scope.accept());
    await normalOccurrence.click();
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect.poll(async () =>
      (await client.from("appointments").select("id").eq("series_id", parentId!).eq("status", "cancelled")).data?.length,
    ).toBe(1);

    const [snapshotA, snapshotB] = await Promise.all([
      client.from("appointments").select("*").eq("id", parentId).single(),
      client.from("appointments").select("*").eq("id", parentId).single(),
    ]);
    const first = await client.from("appointments").update({ title: seriesTitle }).eq("id", parentId)
      .eq("updated_at", snapshotA.data!.updated_at).select("*").maybeSingle();
    const stale = await client.from("appointments").update({ location: "stale overwrite" }).eq("id", parentId)
      .eq("updated_at", snapshotB.data!.updated_at).select("*").maybeSingle();
    expect(first.data?.title).toBe(seriesTitle);
    expect(stale.data).toBeNull();

    const exception = await client.from("appointments").select("*").eq("series_id", parentId).eq("title", exceptionTitle).single();
    const exceptionFresh = await client.from("appointments").update({ location: "fresh exception" }).eq("id", exception.data!.id)
      .eq("updated_at", exception.data!.updated_at).select("*").single();
    const exceptionStale = await client.from("appointments").update({ location: "stale exception" }).eq("id", exception.data!.id)
      .eq("updated_at", exception.data!.updated_at).select("*").maybeSingle();
    expect(exceptionFresh.data.location).toBe("fresh exception");
    expect(exceptionStale.data).toBeNull();

    await client.from("appointments").delete().eq("id", parentId);
    expect((await client.from("appointments").select("id").eq("series_id", parentId)).data).toEqual([]);
    parentId = undefined;
    void parent;
  } finally {
    if (parentId) await client.from("appointments").delete().eq("id", parentId);
    await client.auth.signOut();
  }
});

test("recurring controls remain usable on mobile", async ({ page }, testInfo) => {
  test.skip(!["modern-iphone", "small-iphone", "iphone-landscape"].includes(testInfo.project.name), "Mobile viewport coverage only.");
  await loginPage(page);
  await page.getByRole("button", { name: "New appointment" }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Repeat pattern").selectOption("weekly-n");
  await expect(dialog.getByLabel("Repeat every weeks")).toBeVisible();
  await dialog.getByLabel("Repeat every weeks").fill("3");
  await dialog.getByLabel("Repeat ending").selectOption("date");
  await expect(dialog.getByLabel("Repeat end date")).toBeVisible();
  await expect(dialog).toBeInViewport();
});
