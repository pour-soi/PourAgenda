import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock("web-push", () => ({ default: pushMocks }));

import { runPersonalAppointmentReminderDispatch, type PushWorkerEnv } from "./push-dispatch";

const env: PushWorkerEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  ["SUPABASE_SERVICE_ROLE_KEY"]: "synthetic-admin-value",
  VAPID_PUBLIC_KEY: "synthetic-public",
  VAPID_PRIVATE_KEY: "synthetic-private",
  VAPID_SUBJECT: "mailto:notifications@example.invalid",
};
const appointment = {
  id: "00000000-0000-4000-8000-000000000001", user_id: "user-1", category_id: "category-1",
  title: "Video-doctor", kind: "personal", starts_at: "2026-08-20T16:10:00.000Z", ends_at: "2026-08-20T17:10:00.000Z",
  intended_local_start: "2026-08-20T09:10", intended_local_end: "2026-08-20T10:10", timezone: "America/Los_Angeles",
  all_day: false, location: null, phone: null, email: null, public_notes: null, private_notes: null, status: "confirmed",
  recurrence_frequency: null, recurrence_interval: null, recurrence_until: null, recurrence_count: null, series_id: null,
  original_occurrence_start: null, created_at: "2026-08-01T00:00:00Z", completed_at: null, cancelled_at: null,
  updated_at: "2026-08-01T00:00:00Z",
};

describe("push dispatch", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("claims and sends one due slot per subscription without exposing secrets", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      return new Response(null, { status: 201 });
    }));
    pushMocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    expect(result.sent).toBe(1);
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(requests.filter((request) => request.url.endsWith("push_reminder_deliveries"))).toHaveLength(1);
    expect(JSON.stringify(requests)).not.toContain(env.VAPID_PRIVATE_KEY);
  });

  it("does not schedule other categories or duplicate a claimed slot", async () => {
    let categoryName = "Medical";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: categoryName }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      return new Response(null, { status: 409 });
    }));
    expect((await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"))).sent).toBe(0);
    categoryName = "Personal Appointment";
    expect((await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"))).sent).toBe(0);
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
  });

  it("does not deliver cancelled appointments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("appointments?")) return Response.json([{ ...appointment, status: "cancelled" }]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      return new Response(null, { status: 201 });
    }));
    expect((await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"))).sent).toBe(0);
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
  });

  it("disables an expired subscription after a failed claimed delivery", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      return new Response(null, { status: 201 });
    }));
    pushMocks.sendNotification.mockRejectedValue({ statusCode: 410 });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    expect(requests.some((url) => url.includes("push_subscriptions?id=eq.subscription-1"))).toBe(true);
  });
});
