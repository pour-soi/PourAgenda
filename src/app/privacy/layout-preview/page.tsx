import { notFound } from "next/navigation";
import { AgendaShell } from "@/components/agenda-shell";

export default async function LayoutPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ timeFormat?: string; automaticTimezone?: string }>;
}) {
  if (process.env.POURAGENDA_LAYOUT_PREVIEW !== "1") notFound();
  const resolvedSearchParams = await searchParams;
  const requestedTimeFormat = resolvedSearchParams.timeFormat;
  const timeFormatPreference = requestedTimeFormat === "locale" || requestedTimeFormat === "24h"
    ? requestedTimeFormat
    : "12h";
  const automaticTimezone = resolvedSearchParams.automaticTimezone === "true";

  return (
    <AgendaShell
      email="Private local preview"
      userId="layout-preview"
      timezone="UTC"
      automaticTimezone={automaticTimezone}
      timeFormatPreference={timeFormatPreference}
      defaultDuration={60}
      defaultReminders={[10]}
      categories={[
        { id: "focus", name: "Focus", color: "#375f52", hidden: false },
        { id: "personal", name: "Personal", color: "#a26068", hidden: false },
        { id: "planning", name: "Planning", color: "#5e7296", hidden: false },
      ]}
    />
  );
}
