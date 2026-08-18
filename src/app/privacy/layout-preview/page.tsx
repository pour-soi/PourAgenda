import { notFound } from "next/navigation";
import { LayoutPreviewShell } from "./layout-preview-shell";

export default async function LayoutPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ timeFormat?: string; automaticTimezone?: string; delayedCategories?: string; target?: string; date?: string }>;
}) {
  if (process.env.POURAGENDA_LAYOUT_PREVIEW !== "1") notFound();
  const resolvedSearchParams = await searchParams;
  const requestedTimeFormat = resolvedSearchParams.timeFormat;
  const timeFormatPreference = requestedTimeFormat === "locale" || requestedTimeFormat === "24h"
    ? requestedTimeFormat
    : "12h";
  const automaticTimezone = resolvedSearchParams.automaticTimezone === "true";

  return (
    <LayoutPreviewShell
      automaticTimezone={automaticTimezone}
      timeFormatPreference={timeFormatPreference}
      delayCategories={resolvedSearchParams.delayedCategories === "true"}
      initialNotificationTarget={resolvedSearchParams.target}
      initialAppointmentDate={resolvedSearchParams.date}
    />
  );
}
