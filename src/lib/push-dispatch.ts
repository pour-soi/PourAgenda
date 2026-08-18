import webpush from "web-push";
import { expandAppointments } from "./recurrence";
import { duePersonalReminderSlots, PERSONAL_APPOINTMENT_CATEGORY, PERSONAL_REMINDER_CANDIDATE_MINUTES, personalReminderNotification } from "./personal-appointment-reminders";
import type { Appointment } from "@/types/domain";

export type PushWorkerEnv = {
  SUPABASE_URL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
} & Record<string, string>;
type Category = { id: string; user_id: string; name: string };
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type DeliveryClaim = { delivery_id: string; delivery_attempt_count: number };
const retryDelayMinutes = (attemptCount: number) => attemptCount === 1 ? 5 : 10;
export const pushFailureClass = (statusCode: number) => statusCode === 404 || statusCode === 410
  ? "subscription_gone"
  : statusCode === 0 || statusCode === 408 || statusCode === 429 || statusCode >= 500
    ? "transient"
    : "provider_rejected";

async function supabaseRequest(env: PushWorkerEnv, path: string, init: RequestInit = {}) {
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

async function rows<T>(env: PushWorkerEnv, path: string): Promise<T[]> {
  const response = await supabaseRequest(env, path);
  if (!response.ok) throw new Error(`Supabase reminder query failed with HTTP ${response.status}.`);
  return response.json() as Promise<T[]>;
}

async function claimDelivery(env: PushWorkerEnv, subscription: Subscription, slot: ReturnType<typeof duePersonalReminderSlots>[number], userId: string, now: Date) {
  const response = await supabaseRequest(env, "rpc/claim_push_reminder_delivery", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_appointment_id: slot.appointmentId,
      p_subscription_id: subscription.id,
      p_slot_key: slot.key,
      p_occurrence_start: slot.occurrenceStart,
      p_scheduled_at: slot.scheduledAt,
      p_now: now.toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Reminder claim failed with HTTP ${response.status}.`);
  return ((await response.json()) as DeliveryClaim[])[0] ?? null;
}

async function updateDelivery(env: PushWorkerEnv, deliveryId: string, values: Record<string, unknown>) {
  const response = await supabaseRequest(env, `push_reminder_deliveries?id=eq.${deliveryId}`, {
    method: "PATCH", body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Reminder delivery update failed with HTTP ${response.status}.`);
}

export async function runPersonalAppointmentReminderDispatch(env: PushWorkerEnv, now = new Date()) {
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const) {
    if (!env[name]) throw new Error(`Missing server-only push configuration: ${name}`);
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const [appointments, categories, subscriptions] = await Promise.all([
    rows<Appointment>(env, "appointments?select=*&order=starts_at.asc"),
    rows<Category>(env, "categories?select=id,user_id,name"),
    rows<Subscription>(env, "push_subscriptions?select=id,user_id,endpoint,p256dh,auth&disabled_at=is.null"),
  ]);
  const personalCategoryIds = new Set(categories
    .filter((category) => category.name === PERSONAL_APPOINTMENT_CATEGORY)
    .map((category) => `${category.user_id}:${category.id}`));
  const rangeStart = new Date(now.getTime() - 86_400_000).toISOString();
  const rangeEnd = new Date(now.getTime() + 5 * 86_400_000).toISOString();
  const occurrences = expandAppointments(appointments, rangeStart, rangeEnd)
    .filter((item) => personalCategoryIds.has(`${item.user_id}:${item.category_id}`));
  let sent = 0;
  for (const occurrence of occurrences) {
    for (const slot of duePersonalReminderSlots(occurrence, now, PERSONAL_REMINDER_CANDIDATE_MINUTES)) {
      for (const subscription of subscriptions.filter((item) => item.user_id === occurrence.user_id)) {
        const claim = await claimDelivery(env, subscription, slot, occurrence.user_id, now);
        if (!claim) continue;
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify(await personalReminderNotification(occurrence)), { TTL: 3600 });
        } catch (error) {
          const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          const failureClass = pushFailureClass(statusCode);
          const retryable = failureClass === "transient" && claim.delivery_attempt_count < 3;
          await updateDelivery(env, claim.delivery_id, {
            status: retryable ? "retryable" : "failed",
            next_attempt_at: retryable
              ? new Date(now.getTime() + retryDelayMinutes(claim.delivery_attempt_count) * 60_000).toISOString()
              : null,
            last_error_class: failureClass,
          });
          if (failureClass === "subscription_gone") {
            await supabaseRequest(env, `push_subscriptions?id=eq.${subscription.id}`, {
              method: "PATCH", body: JSON.stringify({ disabled_at: now.toISOString() }),
            });
          }
          continue;
        }
        await updateDelivery(env, claim.delivery_id, {
          status: "sent", sent_at: now.toISOString(), next_attempt_at: null, last_error_class: null,
        });
        sent += 1;
      }
    }
  }
  return { occurrences: occurrences.length, sent };
}
