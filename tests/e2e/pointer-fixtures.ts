import type { Locator, Page } from "@playwright/test";

export async function physicalResize(page: Page, event: Locator) {
  const handle = event.locator(".fc-event-resizer");
  let box = await handle.boundingBox();
  let fallbackPoint: { x: number; y: number } | null = null;
  if (!box) {
    await event.locator("span").first().hover();
    const eventBox = await event.boundingBox();
    if (!eventBox) throw new Error("Rendered FullCalendar event has no bounding box.");
    fallbackPoint = { x: eventBox.x + eventBox.width / 2, y: eventBox.y + eventBox.height - 1 };
    box = await handle.boundingBox();
  }
  const x = box ? box.x + box.width / 2 : fallbackPoint!.x;
  const y = box ? box.y + box.height / 2 : fallbackPoint!.y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 20 });
  await page.mouse.up();
}

export async function physicalDragToNextDay(event: Locator, yDelta = 0) {
  const sourceDate = await event.evaluate((element) =>
    element.closest<HTMLElement>(".fc-timegrid-col[data-date]")?.dataset.date,
  );
  if (!sourceDate) throw new Error("FullCalendar event is not inside a dated week column.");
  const visibleDates = await event.page().locator(".fc-timegrid-col[data-date]").evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.date).filter((value): value is string => Boolean(value)),
  );
  const sourceIndex = visibleDates.indexOf(sourceDate);
  const targetDate = visibleDates[sourceIndex + 1] ?? visibleDates[sourceIndex - 1];
  if (!targetDate) throw new Error("FullCalendar week view has no adjacent dated column for a physical drag.");
  const target = event.page().locator(`.fc-timegrid-col[data-date="${targetDate}"]`);
  await event.scrollIntoViewIfNeeded();
  const sourceBox = await event.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("FullCalendar drag source or target has no bounding box.");
  const page = event.page();
  const sourcePoint = await event.evaluate((element, box) => {
    for (const yOffset of [3, box.height / 3, box.height / 2]) {
      for (const xOffset of [box.width / 2, box.width / 4, box.width * 0.75]) {
        const x = box.x + xOffset;
        const y = box.y + yOffset;
        if (element.contains(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  }, sourceBox);
  if (!sourcePoint) throw new Error("Rendered FullCalendar event is covered and cannot receive a physical pointer drag.");
  const { x: sourceX, y: sourceY } = sourcePoint;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(sourceX + 10, sourceY, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, sourceY + yDelta, { steps: 20 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

export async function physicalDragByPixels(event: Locator, yDelta: number) {
  await event.scrollIntoViewIfNeeded();
  const box = await event.boundingBox();
  if (!box) throw new Error("Rendered FullCalendar drag source has no bounding box.");
  const page = event.page();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(8, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 5 });
  await page.mouse.move(x, y + yDelta, { steps: 20 });
  await page.mouse.up();
}
