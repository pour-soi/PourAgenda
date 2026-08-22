import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Personal Appointment Push migration", () => {
  const sql = readFileSync("supabase/migrations/202608170001_personal_appointment_push.sql", "utf8");
  const categorySql = readFileSync("supabase/migrations/202608220001_category_push_enabled.sql", "utf8");
  it("keeps owner RLS and service-role-only atomic delivery claims", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("unique (subscription_id, slot_key)");
    expect(sql).toContain("claim_push_reminder_delivery");
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function[\s\S]+to service_role/i);
  });
  it("stores bounded retry state without altering existing reminder tables", () => {
    for (const field of ["attempt_count", "next_attempt_at", "last_attempt_at", "last_error_class"]) expect(sql).toContain(field);
    expect(sql).toContain("attempt_count between 0 and 3");
    expect(sql).toContain("delivery.next_attempt_at <= p_now");
    expect(sql).toContain("delivery.next_attempt_at > p_now - interval '15 minutes'");
    expect(sql).toContain("p_scheduled_at > p_now - interval '15 minutes'");
    expect(sql).not.toMatch(/alter table public\.(appointments|appointment_reminders|user_settings)/i);
  });
  it("adds a stable category eligibility flag and uses the name only for one-time bootstrap", () => {
    expect(categorySql).toMatch(/alter table public\.categories\s+add column push_enabled boolean not null default false/i);
    expect(categorySql).toMatch(/update public\.categories[\s\S]+set push_enabled = true[\s\S]+where name = 'Personal Appointment'/i);
    expect(categorySql).not.toMatch(/alter table public\.(appointments|push_subscriptions|push_reminder_deliveries)/i);
  });
});
