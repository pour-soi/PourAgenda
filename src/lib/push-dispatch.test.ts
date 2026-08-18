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
      if (url.includes("rpc/claim_push_reminder_delivery")) return Response.json([{ delivery_id: "delivery-1", delivery_attempt_count: 1 }]);
      return new Response(null, { status: 204 });
    }));
    pushMocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    expect(result.sent).toBe(1);
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(requests.filter((request) => request.url.includes("rpc/claim_push_reminder_delivery"))).toHaveLength(1);
    expect(JSON.stringify(requests)).not.toContain(env.VAPID_PRIVATE_KEY);
  });

  it("does not schedule other categories or duplicate a claimed slot", async () => {
    let categoryName = "Medical";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: categoryName }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      if (url.includes("rpc/claim_push_reminder_delivery")) return Response.json([]);
      return new Response(null, { status: 204 });
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
      if (url.includes("rpc/claim_push_reminder_delivery")) return Response.json([{ delivery_id: "delivery-1", delivery_attempt_count: 1 }]);
      return new Response(null, { status: 204 });
    }));
    expect((await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"))).sent).toBe(0);
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
  });

  it("retries transient failures after five and ten minutes, then stops", async () => {
    const updates: Record<string, unknown>[] = [];
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      if (url.includes("rpc/claim_push_reminder_delivery")) {
        const requested = JSON.parse(String(init?.body)).p_now;
        const due = ["2026-08-17T19:00:00.000Z", "2026-08-17T19:05:00.000Z", "2026-08-17T19:15:00.000Z"];
        if (requested !== due[attempt]) return Response.json([]);
        attempt += 1;
        return Response.json([{ delivery_id: "delivery-1", delivery_attempt_count: attempt }]);
      }
      if (url.includes("push_reminder_deliveries?id=")) updates.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }));
    pushMocks.sendNotification.mockRejectedValue({ statusCode: 503 });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:00:00Z"));
    expect(updates.at(-1)).toMatchObject({ status: "retryable", next_attempt_at: "2026-08-17T19:05:00.000Z", last_error_class: "transient" });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:05:00Z"));
    expect(updates.at(-1)).toMatchObject({ status: "retryable", next_attempt_at: "2026-08-17T19:15:00.000Z" });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:14:00Z"));
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(2);
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:15:00Z"));
    expect(updates.at(-1)).toMatchObject({ status: "failed", next_attempt_at: null });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:25:00Z"));
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(3);
  });

  it("disables an expired subscription after a failed claimed delivery", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) return Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      if (url.includes("push_subscriptions?")) return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      if (url.includes("rpc/claim_push_reminder_delivery")) return Response.json([{ delivery_id: "delivery-1", delivery_attempt_count: 1 }]);
      return new Response(null, { status: 204 });
    }));
    pushMocks.sendNotification.mockRejectedValue({ statusCode: 410 });
    await runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    expect(requests.some((url) => url.includes("push_subscriptions?id=eq.subscription-1"))).toBe(true);
  });
});
