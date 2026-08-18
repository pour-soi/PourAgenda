import { describe, expect, it } from "vitest";
import { appointmentNotificationPath, notificationTargetKey, safeInternalPath } from "./notification-deep-link";

describe("notification deep links", () => {
  it("encodes an opaque occurrence target and date as an internal authenticated target", async () => {
    const target = await notificationTargetKey("series:2026-08-20T16:10:00Z");
    expect(appointmentNotificationPath(target, "2026-08-20"))
      .toBe(`/?target=${target}&date=2026-08-20`);
  });
  it("rejects external redirect targets", () => {
    expect(safeInternalPath("//example.invalid/steal")).toBe("/");
    expect(safeInternalPath("https://example.invalid/steal")).toBe("/");
  });
});
