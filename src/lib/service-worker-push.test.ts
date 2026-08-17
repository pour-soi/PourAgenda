// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service worker push support", () => {
  const source = readFileSync("public/sw.js", "utf8");
  it("shows the received Personal Appointment notification and opens its appointment target", () => {
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("appointmentId");
  });
});
