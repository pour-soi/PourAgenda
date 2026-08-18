import { redirect } from "next/navigation";
import { AgendaShell } from "@/components/agenda-shell";
import { createClient } from "@/lib/supabase/server";

export default async function Home({ searchParams }: { searchParams: Promise<{ target?: string; date?: string }> }) {
  const target = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  if (!userId) {
    const params = new URLSearchParams();
    if (target.target) params.set("target", target.target);
    if (target.date) params.set("date", target.date);
    const next = params.size ? `/?${params.toString()}` : "/";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const [{ data: settings }, { data: categories }] = await Promise.all([
    supabase.from("user_settings").select("timezone,automatic_timezone,time_format,default_duration_minutes,default_reminder_minutes").eq("user_id", userId).single(),
    supabase.from("categories").select("id,name,color,hidden").eq("user_id", userId).order("name"),
  ]);
  return <AgendaShell email={email} userId={userId} initialNotificationTarget={target.target} initialAppointmentDate={target.date}
    timezone={settings?.timezone ?? "UTC"}
    automaticTimezone={settings?.automatic_timezone ?? true}
    timeFormatPreference={settings?.time_format ?? "locale"}
    defaultDuration={settings?.default_duration_minutes ?? 60}
    defaultReminders={settings?.default_reminder_minutes ?? []}
    categories={categories ?? []} />;
}
