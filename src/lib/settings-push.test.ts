import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings Push controls", () => {
  const source = readFileSync("src/components/settings-manager.tsx", "utf8");
  it("supports explicit enable, enabled, blocked, unavailable, and disable states", () => {
    for (const label of ["Enable notifications", "Notifications enabled", "Notifications blocked", "Notifications unavailable", "Disable notifications"]) {
      expect(source).toContain(label);
    }
  });
  it("does not change appointment or manual-reminder data while disabling Push", () => {
    const disableFlow = source.slice(source.indexOf("async function disablePersonalAppointmentPush"), source.indexOf("async function exportData"));
    expect(disableFlow).toContain('from("push_subscriptions")');
    expect(disableFlow).not.toMatch(/appointments|reminder_minutes|user_settings/);
  });
});
