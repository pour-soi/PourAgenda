"use client";

import { useSyncExternalStore } from "react";
import { detectSystemHourCycle, formatDateTime, resolveTimeFormat } from "@/lib/date-format";

const subscribe = () => () => undefined;
const serverHourCycle = () => "h12" as const;

export function SharedAppointmentTime({ start, end, timezone }: { start: string; end: string; timezone: string }) {
  const systemHourCycle = useSyncExternalStore(subscribe, detectSystemHourCycle, serverHourCycle);
  const timeFormat = resolveTimeFormat("locale", systemHourCycle);
  return <>{formatDateTime(start, timezone, timeFormat)} – {formatDateTime(end, timezone, timeFormat)} ({timezone})</>;
}
