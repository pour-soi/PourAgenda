"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appointmentCursor, mergeAppointmentPages, type AppointmentCursor, type AppointmentListSection } from "@/lib/appointment-lists";
import { localInputToUtc } from "@/lib/appointments";
import { expandAppointments } from "@/lib/recurrence";
import type { Appointment, AppointmentKind, AppointmentOccurrence } from "@/types/domain";
import { formatDateTime, type TimeFormat } from "@/lib/date-format";

const PAGE_SIZE = 20;
const stableId = (item: Appointment) =>
  (item as Partial<AppointmentOccurrence>).occurrence_id ?? item.id;
const labels: Record<AppointmentListSection, string> = {
  upcoming: "Upcoming", today: "Today", "this-week": "This week",
  completed: "Completed", cancelled: "Cancelled",
};

function dayBounds(timezone: string) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const nextLocal = new Date(`${local}T00:00:00Z`);
  nextLocal.setUTCDate(nextLocal.getUTCDate() + 1);
  return {
    start: localInputToUtc(`${local}T00:00`, timezone),
    end: localInputToUtc(`${nextLocal.toISOString().slice(0, 10)}T00:00`, timezone),
  };
}

export function AppointmentListPanel({
  section, kind, category, search, timezone, timeFormat, refreshKey, onOpen,
}: {
  section: AppointmentListSection;
  kind: "all" | AppointmentKind;
  category: string;
  search: string;
  timezone: string;
  timeFormat: TimeFormat;
  refreshKey: number;
  onOpen: (appointment: Appointment) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Appointment[]>([]);
  const cursor = useRef<AppointmentCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadedOnce = useRef(false);
  const refreshEffectReady = useRef(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    const requestId = ++requestSequence.current;
    if (reset) {
      if (loadedOnce.current) setRefreshing(true);
      else setLoading(true);
    }
    else setLoadingMore(true);
    setError("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
    const now = new Date();
    const today = dayBounds(timezone);
    const weekEnd = new Date(today.end);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const horizonStart = section === "today" || section === "this-week" ? today.start
      : section === "upcoming" ? now.toISOString() : new Date(now.getTime() - 365 * 864e5).toISOString();
    const horizonEnd = section === "today" ? today.end : section === "this-week" ? weekEnd.toISOString()
      : new Date(now.getTime() + 365 * 864e5).toISOString();
    const sortField = section === "completed" ? "completed_at" : section === "cancelled" ? "cancelled_at" : "starts_at";
    const ascending = ["upcoming", "today", "this-week"].includes(section);
    let query = supabase.from("appointments").select("*").is("series_id", null).is("recurrence_frequency", null)
      .order(sortField, { ascending, nullsFirst: false }).order("id", { ascending: true }).limit(PAGE_SIZE + 1);

    if (section === "upcoming") query = query.in("status", ["pending", "confirmed"]).gte("starts_at", now.toISOString());
    if (section === "today") query = query.neq("status", "cancelled").lt("starts_at", today.end).gt("ends_at", today.start);
    if (section === "this-week") query = query.neq("status", "cancelled").lt("starts_at", weekEnd.toISOString()).gt("ends_at", today.start);
    if (section === "completed") query = query.eq("status", "completed").not("completed_at", "is", null);
    if (section === "cancelled") query = query.eq("status", "cancelled").not("cancelled_at", "is", null);
    if (kind !== "all") query = query.eq("kind", kind);
    if (category !== "all") query = query.eq("category_id", category);
    const term = search.trim().replace(/[,%()]/g, " ");
    if (term) query = query.or(`title.ilike.%${term}%,location.ilike.%${term}%,public_notes.ilike.%${term}%,private_notes.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    const activeCursor = reset ? null : cursor.current;
    if (activeCursor) {
      const comparison = ascending ? "gt" : "lt";
      const databaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeCursor.id);
      if (databaseId) {
        const value = `"${activeCursor.value}"`;
        query = query.or(`${sortField}.${comparison}.${value},and(${sortField}.eq.${value},id.gt.${activeCursor.id})`);
      } else {
        query = ascending ? query.gte(sortField, activeCursor.value) : query.lte(sortField, activeCursor.value);
      }
    }
    const { data, error: queryError } = await query.abortSignal(controller.signal);
    if (requestId !== requestSequence.current) return;
    if (queryError) setError("This appointment list could not be loaded. Check your connection and retry.");
    else {
      const seriesResult = await supabase.from("appointments").select("*").is("series_id", null)
        .not("recurrence_frequency", "is", null).lt("starts_at", horizonEnd)
        .or(`recurrence_until.is.null,recurrence_until.gte.${horizonStart.slice(0, 10)}`).limit(200)
        .abortSignal(controller.signal);
      const seriesIds = (seriesResult.data ?? []).map((item) => item.id);
      const exceptionsResult = seriesIds.length
        ? await supabase.from("appointments").select("*").in("series_id", seriesIds).limit(500)
          .abortSignal(controller.signal)
        : { data: [], error: null };
      if (requestId !== requestSequence.current) return;
      if (seriesResult.error || exceptionsResult.error) {
        setError("This appointment list could not be loaded. Check your connection and retry.");
        setLoading(false); setLoadingMore(false); setRefreshing(false);
        return;
      }
      const recurring = expandAppointments(
        [...(seriesResult.data ?? []), ...(exceptionsResult.data ?? [])] as Appointment[],
        horizonStart, horizonEnd, 500, section === "cancelled",
      ).filter((item) => {
        if (section === "upcoming" && (!["pending", "confirmed"].includes(item.status) || item.starts_at < now.toISOString())) return false;
        if (section === "today" && item.status === "cancelled") return false;
        if (section === "this-week" && item.status === "cancelled") return false;
        if (section === "completed" && item.status !== "completed") return false;
        if (section === "cancelled" && item.status !== "cancelled") return false;
        if (kind !== "all" && item.kind !== kind) return false;
        if (category !== "all" && item.category_id !== category) return false;
        if (term && ![item.title,item.location,item.public_notes,item.private_notes,item.phone,item.email].some((value) => value?.toLowerCase().includes(term.toLowerCase()))) return false;
        return true;
      });
      const candidates = [...((data ?? []) as Appointment[]), ...recurring]
        .filter((item) => {
          if (!activeCursor) return true;
          const value = item[sortField];
          if (!value || (ascending ? value < activeCursor.value : value > activeCursor.value)) return false;
          return value !== activeCursor.value || stableId(item) > activeCursor.id;
        })
        .sort((a, b) => {
          const aValue = a[sortField] ?? "";
          const bValue = b[sortField] ?? "";
          const order = aValue.localeCompare(bValue);
          return (ascending ? order : -order) || stableId(a).localeCompare(stableId(b));
        });
      const page = candidates.slice(0, PAGE_SIZE);
      setRows((current) => reset ? page : mergeAppointmentPages(current, page));
      setHasMore(candidates.length > PAGE_SIZE);
      cursor.current = appointmentCursor(page, sortField);
    }
    setLoading(false); setLoadingMore(false); setRefreshing(false);
    loadedOnce.current = true;
    } catch {
      if (requestId !== requestSequence.current) return;
      setError("This appointment list could not be loaded. Check your connection and retry.");
      setLoading(false); setLoadingMore(false); setRefreshing(false);
      loadedOnce.current = true;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [category, kind, search, section, supabase, timezone]);

  useEffect(() => {
    let loadTimer: number | undefined;
    const resetTimer = window.setTimeout(() => {
      setRows([]);
      cursor.current = null;
      setHasMore(true);
      setLoading(true);
      loadedOnce.current = false;
      loadTimer = window.setTimeout(() => void load(true), search ? 300 : 0);
    }, 0);
    return () => {
      window.clearTimeout(resetTimer);
      if (loadTimer) window.clearTimeout(loadTimer);
    };
    // Cursor changes must not reset the current page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, kind, search, section, timezone]);
  useEffect(() => {
    if (!refreshEffectReady.current) {
      refreshEffectReady.current = true;
      return;
    }
    void load(true);
    // A server-side mutation refreshes the current query without clearing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return <section aria-label={`${labels[section]} appointments`} className="rounded-[var(--radius)] border border-border bg-surface p-4 sm:p-5">
    <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{labels[section]}</h2>{refreshing && <span role="status" className="text-sm text-muted">Refreshing…</span>}</div>
    {loading && <p role="status" className="mt-5 text-muted">Loading appointments…</p>}
    {error && <div className="mt-5 rounded-lg border border-red-700 p-3"><p role="alert">{error}</p><button onClick={() => void load(true)} className="mt-2 rounded-lg border border-border px-3">Retry</button></div>}
    {!loading && !error && rows.length === 0 && <p className="mt-5 rounded-lg bg-background p-5 text-muted">{search.trim() ? "No appointments match your search." : `No ${labels[section].toLowerCase()} appointments.`}</p>}
    <div className="mt-4 space-y-2">
      {rows.map((item) => <button key={item.id} onClick={() => onOpen(item)} className="w-full rounded-lg border border-border p-4 text-left">
        <span className="font-semibold">{item.title}</span>
        <span className="mt-1 block text-sm text-muted">{formatDateTime(item.starts_at, timezone, timeFormat)}</span>
        {section === "completed" && item.completed_at && <span className="mt-1 block text-xs">Completed {formatDateTime(item.completed_at, timezone, timeFormat)}</span>}
        {section === "cancelled" && item.cancelled_at && <span className="mt-1 block text-xs">Cancelled {formatDateTime(item.cancelled_at, timezone, timeFormat)}</span>}
      </button>)}
    </div>
    {!loading && !error && rows.length > 0 && (hasMore
      ? <button disabled={loadingMore} onClick={() => void load(false)} className="mt-4 w-full rounded-lg border border-border px-4">{loadingMore ? "Loading more…" : "Load more"}</button>
      : <p className="mt-4 text-center text-sm text-muted">End of list.</p>)}
  </section>;
}
