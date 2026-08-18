export function safeInternalPath(value: string | null | undefined, fallback = "/") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function notificationTargetKey(occurrenceId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(occurrenceId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function appointmentNotificationPath(target: string, date: string) {
  const params = new URLSearchParams({ target });
  if (date) params.set("date", date);
  return `/?${params.toString()}`;
}
