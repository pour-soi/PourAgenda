import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/date-format";

export const metadata: Metadata = { title: "Shared appointment", robots: { index: false, follow: false } };

export default async function SharedAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  noStore();
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_public_appointment_share", { raw_token: token });
  const item = data?.[0];
  if (error || !item) notFound();
  const recurrence = item.recurrence_frequency
    ? `Repeats ${item.recurrence_frequency}${item.recurrence_interval > 1 ? ` every ${item.recurrence_interval}` : ""}${item.recurrence_until ? ` until ${item.recurrence_until}` : ""}.`
    : null;
  return <main className="min-h-dvh bg-background p-4 sm:p-8">
    <article className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Shared appointment</p>
      <h1 className="mt-3 text-3xl font-semibold">{item.title}</h1>
      <dl className="mt-6 space-y-4">
        <div><dt className="font-semibold">Date and time</dt><dd>{formatDateTime(item.starts_at, item.timezone, "12h")} – {formatDateTime(item.ends_at, item.timezone, "12h")} ({item.timezone})</dd></div>
        {item.location && <div><dt className="font-semibold">Location</dt><dd>{item.location}</dd></div>}
        {recurrence && <div><dt className="font-semibold">Recurrence</dt><dd>{recurrence}</dd></div>}
        {item.public_notes && <div><dt className="font-semibold">Notes</dt><dd className="whitespace-pre-wrap">{item.public_notes}</dd></div>}
      </dl>
    </article>
  </main>;
}
