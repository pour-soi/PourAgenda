import webpush from "web-push";
import { expandAppointments } from "./recurrence";
import { duePersonalReminderSlots, PERSONAL_APPOINTMENT_CATEGORY, personalReminderNotification } from "./personal-appointment-reminders";
import type { Appointment } from "@/types/domain";

export type PushWorkerEnv = {
  SUPABASE_URL: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
} & Record<string, string>;
type Category = { id: string; user_id: string; name: string };
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

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
    for (const slot of duePersonalReminderSlots(occurrence, now)) {
      for (const subscription of subscriptions.filter((item) => item.user_id === occurrence.user_id)) {
        const claim = await supabaseRequest(env, "push_reminder_deliveries", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: occurrence.user_id,
            appointment_id: slot.appointmentId,
            subscription_id: subscription.id,
            slot_key: slot.key,
            occurrence_start: slot.occurrenceStart,
            scheduled_at: slot.scheduledAt,
            status: "claimed",
          }),
        });
        if (claim.status === 409) continue;
        if (!claim.ok) throw new Error(`Reminder claim failed with HTTP ${claim.status}.`);
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify(personalReminderNotification(occurrence)), { TTL: 3600 });
          await supabaseRequest(env, `push_reminder_deliveries?subscription_id=eq.${subscription.id}&slot_key=eq.${encodeURIComponent(slot.key)}`, {
            method: "PATCH", body: JSON.stringify({ status: "sent", sent_at: now.toISOString() }),
          });
          sent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          await supabaseRequest(env, `push_reminder_deliveries?subscription_id=eq.${subscription.id}&slot_key=eq.${encodeURIComponent(slot.key)}`, {
            method: "PATCH", body: JSON.stringify({ status: "failed" }),
          });
          if (statusCode === 404 || statusCode === 410) {
            await supabaseRequest(env, `push_subscriptions?id=eq.${subscription.id}`, {
              method: "PATCH", body: JSON.stringify({ disabled_at: now.toISOString() }),
            });
          }
        }
      }
    }
  }
  return { occurrences: occurrences.length, sent };
}
