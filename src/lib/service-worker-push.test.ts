// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service worker push support", () => {
  const source = readFileSync("public/sw.js", "utf8");
  it("shows the received Personal Appointment notification and opens its appointment target", () => {
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("payload.target");
    expect(source).toContain("/?target=");
    expect(source).not.toContain("appointmentId");
    const pushHandler = source.slice(source.indexOf('addEventListener("push"'), source.indexOf('addEventListener("notificationclick"'));
    expect(pushHandler).not.toMatch(/private_notes|public_notes|location|phone|email/);
  });
});
