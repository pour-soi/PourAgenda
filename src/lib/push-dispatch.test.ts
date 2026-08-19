import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const futureJwtFailure = () => Response.json(
  { code: "PGRST303", message: "JWT issued at future." },
  { status: 401 },
);

describe("push dispatch", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });
  it.each([
    {
      label: "uses a new Supabase Secret key only as the API key",
      serviceRoleKey: "sb_secret_test",
      expectedAuthorization: null,
    },
    {
      label: "retains legacy JWT service-role authentication",
      serviceRoleKey: "legacy.payload.signature",
      expectedAuthorization: "Bearer legacy.payload.signature",
    },
  ])("$label for table queries, RPC calls, and delivery updates", async ({ serviceRoleKey, expectedAuthorization }) => {
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

    await runPersonalAppointmentReminderDispatch(
      { ...env, ["SUPABASE_SERVICE_ROLE_KEY"]: serviceRoleKey },
      new Date("2026-08-17T19:04:00Z"),
    );

    for (const expectedPath of [
      "appointments?",
      "categories?",
      "push_subscriptions?",
      "rpc/claim_push_reminder_delivery",
      "push_reminder_deliveries?id=eq.delivery-1",
    ]) {
      expect(requests.some(({ url }) => url.includes(expectedPath))).toBe(true);
    }
    for (const request of requests) {
      const headers = new Headers(request.init?.headers);
      expect(headers.get("apikey")).toBe(serviceRoleKey);
      expect(headers.get("authorization")).toBe(expectedAuthorization);
    }
  });

  it("constructs canonical REST paths from a Supabase project URL", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      return Response.json([]);
    }));

    await runPersonalAppointmentReminderDispatch(
      { ...env, SUPABASE_URL: "https://example.supabase.co/rest/v1/" },
      new Date("2026-08-17T19:04:00Z"),
    );

    expect(requests).toEqual([
      "https://example.supabase.co/rest/v1/appointments?select=*&order=starts_at.asc",
      "https://example.supabase.co/rest/v1/categories?select=id,user_id,name",
      "https://example.supabase.co/rest/v1/push_subscriptions?select=id,user_id,endpoint,p256dh,auth&disabled_at=is.null",
    ]);
  });

  it("retries one future-JWT failure after one second with an identical request", async () => {
    vi.useFakeTimers();
    const categoryRequests: { url: string; init?: RequestInit }[] = [];
    let categoryAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("categories?")) {
        categoryRequests.push({ url, init });
        categoryAttempts += 1;
        return categoryAttempts === 1 ? futureJwtFailure() : Response.json([]);
      }
      return Response.json([]);
    }));

    const dispatch = runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    await vi.advanceTimersByTimeAsync(999);
    expect(categoryAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(dispatch).resolves.toEqual({ occurrences: 0, sent: 0 });
    expect(categoryAttempts).toBe(2);
    const snapshots = categoryRequests.map(({ url, init }) => ({
      url,
      method: init?.method,
      body: init?.body,
      headers: [...new Headers(init?.headers).entries()],
    }));
    expect(snapshots[1]).toEqual(snapshots[0]);
  });

  it("retries two future-JWT failures after one and two seconds", async () => {
    vi.useFakeTimers();
    let categoryAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("categories?")) {
        categoryAttempts += 1;
        return categoryAttempts < 3 ? futureJwtFailure() : Response.json([]);
      }
      return Response.json([]);
    }));

    const dispatch = runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(categoryAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(dispatch).resolves.toEqual({ occurrences: 0, sent: 0 });
    expect(categoryAttempts).toBe(3);
  });

  it("throws after three future-JWT failures", async () => {
    vi.useFakeTimers();
    let categoryAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("categories?")) {
        categoryAttempts += 1;
        return futureJwtFailure();
      }
      return Response.json([]);
    }));

    const dispatch = runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    const rejection = expect(dispatch).rejects.toThrow("Supabase categories query failed with HTTP 401 (PGRST303): JWT issued at future.");
    await vi.runAllTimersAsync();
    await rejection;
    expect(categoryAttempts).toBe(3);
  });

  it("does not retry unrelated HTTP 401 responses", async () => {
    let categoryAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("categories?")) {
        categoryAttempts += 1;
        return Response.json({ code: "PGRST301", message: "Invalid JWT." }, { status: 401 });
      }
      return Response.json([]);
    }));

    await expect(runPersonalAppointmentReminderDispatch(env)).rejects.toThrow("HTTP 401 (PGRST301)");
    expect(categoryAttempts).toBe(1);
  });

  it("does not retry other HTTP failures", async () => {
    let categoryAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("categories?")) {
        categoryAttempts += 1;
        return Response.json({ code: "PGRSTX00", message: "Internal error." }, { status: 500 });
      }
      return Response.json([]);
    }));

    await expect(runPersonalAppointmentReminderDispatch(env)).rejects.toThrow("HTTP 500 (PGRSTX00)");
    expect(categoryAttempts).toBe(1);
  });

  it("does not claim or deliver before all initial queries succeed", async () => {
    vi.useFakeTimers();
    let categoryAttempts = 0;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      if (url.includes("appointments?")) return Response.json([appointment]);
      if (url.includes("categories?")) {
        categoryAttempts += 1;
        return categoryAttempts === 1
          ? futureJwtFailure()
          : Response.json([{ id: "category-1", user_id: "user-1", name: "Personal Appointment" }]);
      }
      if (url.includes("push_subscriptions?")) {
        return Response.json([{ id: "subscription-1", user_id: "user-1", endpoint: "https://push.invalid/1", p256dh: "fake", auth: "fake" }]);
      }
      if (url.includes("rpc/claim_push_reminder_delivery")) return Response.json([]);
      return new Response(null, { status: 204 });
    }));

    const dispatch = runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    await vi.advanceTimersByTimeAsync(999);
    expect(requests.some((url) => url.includes("rpc/claim_push_reminder_delivery"))).toBe(false);
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await dispatch;
    expect(requests.some((url) => url.includes("rpc/claim_push_reminder_delivery"))).toBe(true);
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["appointments", "appointments query"],
    ["categories", "categories query"],
    ["push_subscriptions", "push_subscriptions query"],
  ])("labels and redacts a failed %s request", async (failedPath, operation) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes(`${failedPath}?`)) {
        return Response.json({
          code: "PGRST205",
          message: `Missing ${env.SUPABASE_SERVICE_ROLE_KEY} and ${env.VAPID_PRIVATE_KEY} at https://private.invalid/path`,
        }, { status: 404 });
      }
      return Response.json([]);
    }));

    const dispatch = runPersonalAppointmentReminderDispatch(env, new Date("2026-08-17T19:04:00Z"));
    await expect(dispatch).rejects.toThrow(`Supabase ${operation} failed with HTTP 404 (PGRST205)`);
    await expect(dispatch).rejects.not.toThrow(env.SUPABASE_SERVICE_ROLE_KEY);
    await expect(dispatch).rejects.not.toThrow(env.VAPID_PRIVATE_KEY);
    await expect(dispatch).rejects.not.toThrow("private.invalid");
  });

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
