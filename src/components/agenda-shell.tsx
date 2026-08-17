"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, Filter, List, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { AppointmentListPanel } from "@/components/appointment-list-panel";
import { GlobalEventSearch } from "@/components/global-event-search";
import { QuickAdd } from "@/components/quick-add";
import { EnglishDateTimePicker, type TimeFormat } from "@/components/date-time-picker";
import { detectSystemHourCycle, detectSystemTimezone, formatDate, formatDateTime, formatTime, resolveActiveTimezone, resolveTimeFormat, type TimeFormatPreference } from "@/lib/date-format";
import { allDayEditorRange, allDayEndToInput, allDayEndToUtc, allDayStartToUtc, allDayStorageRange, appointmentError, appointmentInput, findConflicts, localInputToUtc, toLocalInput, undoAppointmentValues } from "@/lib/appointments";
import { activeFilterCount, appointmentListSections, type AppointmentListSection } from "@/lib/appointment-lists";
import type { QuickAddResult, SearchableEvent } from "@/lib/personal-productivity";
import { expandAppointments, findRecurringConflicts, type RecurrencePreviewItem } from "@/lib/recurrence";
import { RecurrenceEditor } from "@/components/recurrence-editor";
import { REMINDER_OPTIONS, normalizeReminderMinutes, reminderTimes } from "@/lib/reminders";
import { createClient } from "@/lib/supabase/client";
import { buildCalendarEvents } from "@/lib/calendar-events";
import type { Appointment, AppointmentOccurrence, RecurrenceFrequency } from "@/types/domain";

const Calendar = dynamic(() => import("@/components/calendar-view"), {
  ssr: false,
  loading: () => <div className="p-8 text-muted">Loading calendar…</div>,
});
declare global {
  interface Window {
    __pourAgendaInvalidateSession?: () => Promise<void>;
  }
}
type Category = { id: string; name: string; color: string; hidden: boolean };
const subscribeToSystemTimeFormat = () => () => undefined;
const getServerHourCycle = () => "h12" as const;
const subscribeToSystemTimezone = (onChange: () => void) => {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
};
const localFieldMilliseconds = (value: string) => Date.parse(`${value}:00Z`);
const shiftLocalField = (value: string, milliseconds: number) =>
  new Date(localFieldMilliseconds(value) + milliseconds).toISOString().slice(0, 16);
const validDuration = (value: number) => Number.isInteger(value) && value >= 5 && value <= 1440 ? value : 60;
type Draft = {
  title: string; category_id: string; starts_at: string; ends_at: string;
  all_day: boolean; location: string; public_notes: string; private_notes: string; recurrence_frequency: RecurrenceFrequency | "";
  recurrence_interval: number; recurrence_until: string;
  reminder_minutes: number[];
};
const blankDraft = (categoryId: string, timezone: string, reminders: number[], durationMinutes: number): Draft => {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + validDuration(durationMinutes) * 60_000);
  return { title: "", category_id: categoryId, starts_at: toLocalInput(start.toISOString(), timezone),
    ends_at: toLocalInput(end.toISOString(), timezone), all_day: false, location: "",
    public_notes: "", private_notes: "", recurrence_frequency: "", recurrence_interval: 1,
    recurrence_until: "", reminder_minutes: reminders };
};

export function AgendaShell({ email, userId, timezone: configuredTimezone, automaticTimezone, timeFormatPreference, defaultDuration, defaultReminders, categories }: {
  email: string; userId: string; timezone: string; automaticTimezone: boolean; timeFormatPreference: TimeFormatPreference | string; defaultDuration: number; defaultReminders: number[]; categories: Category[];
}) {
  const systemHourCycle = useSyncExternalStore(subscribeToSystemTimeFormat, detectSystemHourCycle, getServerHourCycle);
  const systemTimezone = useSyncExternalStore(subscribeToSystemTimezone, detectSystemTimezone, () => configuredTimezone);
  const timezone = resolveActiveTimezone(configuredTimezone, automaticTimezone, systemTimezone);
  const timeFormat: TimeFormat = resolveTimeFormat(timeFormatPreference, systemHourCycle);
  const defaultDurationMinutes = validDuration(defaultDuration);
  const supabase = useMemo(() => createClient(), []);
  const [appointments, setAppointments] = useState<AppointmentOccurrence[]>([]);
  const [recurrenceRows, setRecurrenceRows] = useState<Appointment[]>([]);
  const [range, setRange] = useState({ start: new Date(0), end: new Date(864e5) });
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(() => blankDraft(categories[0]?.id ?? "", timezone, defaultReminders, defaultDurationMinutes));
  const [editing, setEditing] = useState<Appointment | AppointmentOccurrence | null>(null);
  const [editingSeriesParent, setEditingSeriesParent] = useState<Appointment | null>(null);
  const [editScope, setEditScope] = useState<"single" | "series" | "occurrence">("single");
  const [deferRecurringScope, setDeferRecurringScope] = useState(false);
  const [seriesParentId, setSeriesParentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [draftHint, setDraftHint] = useState("");
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [allowConflict, setAllowConflict] = useState(false);
  const [view, setView] = useState<"calendar" | "lists">("calendar");
  const [calendarView, setCalendarView] = useState<string | null>(null);
  const [listSection, setListSection] = useState<AppointmentListSection>("upcoming");
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stale, setStale] = useState(false);
  const [undo, setUndo] = useState<{
    item: Appointment;
    previous: Partial<Appointment>;
    label: string;
  } | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);
  const [calendarLoadError, setCalendarLoadError] = useState("");
  const [appointmentsLoadedAt, setAppointmentsLoadedAt] = useState(0);
  const [online, setOnline] = useState(true);
  const [share, setShare] = useState<{ id: string; revoked_at: string | null; expires_at: string | null; updated_at: string } | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareLocation, setShareLocation] = useState(false);
  const [shareNotes, setShareNotes] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [searchCatalog, setSearchCatalog] = useState<Appointment[]>([]);
  const [searchCatalogLoading, setSearchCatalogLoading] = useState(false);
  const [searchCatalogError, setSearchCatalogError] = useState("");
  const [searchCatalogLoaded, setSearchCatalogLoaded] = useState(false);
  const calendarLoaded = useRef(false);
  const calendarLoadGeneration = useRef(0);
  const endOverridden = useRef(false);
  const recurringChoiceRef = useRef<HTMLDivElement>(null);
  const initialDraft = useRef<Draft | null>(null);
  const saveContext = useRef<{ scope: "single" | "series" | "occurrence"; editing: Appointment | AppointmentOccurrence | null; draft: Draft } | null>(null);
  const [recurringEditChoice, setRecurringEditChoice] = useState<{ action: "save" | "delete"; item: Appointment | AppointmentOccurrence; trigger: HTMLElement | null } | null>(null);
  const updateRange = useCallback((start: Date, end: Date) => {
    setRange((current) => (
      current.start.getTime() === start.getTime() && current.end.getTime() === end.getTime()
        ? current
        : { start, end }
    ));
  }, []);

  const load = useCallback(async () => {
    const generation = ++calendarLoadGeneration.current;
    if (calendarLoaded.current) setCalendarRefreshing(true);
    else setCalendarLoading(true);
    const start = new Date(range.start.getTime() - 7 * 864e5).toISOString();
    const end = new Date(range.end.getTime() + 7 * 864e5).toISOString();
    const [singleResult, seriesResult] = await Promise.all([
      supabase.from("appointments").select("*").is("series_id", null).is("recurrence_frequency", null)
        .lt("starts_at", end).gt("ends_at", start).order("starts_at").limit(200),
      supabase.from("appointments").select("*").is("series_id", null).not("recurrence_frequency", "is", null)
        .lt("starts_at", end).or(`recurrence_until.is.null,recurrence_until.gte.${start.slice(0, 10)}`).limit(200),
    ]);
    const seriesIds = (seriesResult.data ?? []).map((item) => item.id);
    const exceptionResult = seriesIds.length
      ? await supabase.from("appointments").select("*").in("series_id", seriesIds).limit(500)
      : { data: [], error: null };
    if (generation !== calendarLoadGeneration.current) return;
    const error = singleResult.error ?? seriesResult.error ?? exceptionResult.error;
    if (error) setCalendarLoadError("Appointments could not be loaded. Check your connection and try again.");
    else {
      setCalendarLoadError("");
      setAppointmentsLoadedAt(Date.now());
      const sourceRows = [...(singleResult.data ?? []), ...(seriesResult.data ?? []), ...(exceptionResult.data ?? [])] as Appointment[];
      setRecurrenceRows(sourceRows);
      const expanded = expandAppointments(
        sourceRows,
        start, end,
      );
      const term = search.trim().toLowerCase();
      setAppointments(expanded.filter((item) => {
        if (category !== "all" && item.category_id !== category) return false;
        if (item.status === "cancelled") return false;
        if (term && ![item.title, item.location, item.public_notes, item.private_notes]
          .some((value) => value?.toLowerCase().includes(term))) return false;
        return true;
      }));
      calendarLoaded.current = true;
    }
    setCalendarLoading(false); setCalendarRefreshing(false);
  }, [category, range, search, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      window.__pourAgendaInvalidateSession = async () => {
        await supabase.auth.signOut({ scope: "local" });
      };
      return () => { delete window.__pourAgendaInvalidateSession; };
    }
  }, [supabase]);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    const timers: number[] = [];
    for (const item of appointments) {
      reminderTimes(item.starts_at, item.reminder_minutes ?? [], item.status).forEach((instant, index) => {
        const delay = Date.parse(instant) - Date.now();
        if (delay < 0 || delay > 2_147_000_000) return;
        const identity = `pouragenda-reminder:${item.occurrence_id}:${item.starts_at}:${item.reminder_minutes?.[index] ?? 0}`;
        if (sessionStorage.getItem(identity)) return;
        timers.push(window.setTimeout(() => {
          sessionStorage.setItem(identity, "shown");
          setMessage(`Reminder: ${item.title} starts ${formatDateTime(item.starts_at, timezone, timeFormat)}.`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(item.title, { body: `Starts ${formatDateTime(item.starts_at, timezone, timeFormat)}`, tag: identity });
          }
        }, delay));
      });
    }
    return () => timers.forEach(window.clearTimeout);
  }, [appointments, timeFormat, timezone]);
  const loadSearchCatalog = useCallback(async () => {
    if (!navigator.onLine) return;
    setSearchCatalogLoading(true);
    setSearchCatalogError("");
    const result = await supabase.from("appointments").select("*")
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false }).limit(1000);
    if (result.error) setSearchCatalogError("Search could not load all authorized events. Try again.");
    else {
      setSearchCatalog(result.data as Appointment[]);
      setSearchCatalogLoaded(true);
    }
    setSearchCatalogLoading(false);
  }, [supabase]);
  const openGlobalSearch = useCallback(() => {
    setGlobalSearchOpen(true);
    if (!searchCatalogLoaded && navigator.onLine) void loadSearchCatalog();
  }, [loadSearchCatalog, searchCatalogLoaded]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches("input, textarea, select, [contenteditable='true']");
      const command = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
      if ((!command && !slash) || (editingText && !command)) return;
      event.preventDefault();
      openGlobalSearch();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openGlobalSearch]);

  function startCreate(start?: Date, end?: Date, allDay = false) {
    const next = blankDraft(categories[0]?.id ?? "", timezone, defaultReminders, defaultDurationMinutes);
    if (start && end) {
      next.starts_at = allDay ? start.toISOString().slice(0, 10) : toLocalInput(start.toISOString(), timezone);
      next.ends_at = allDay ? allDayEndToInput(end.toISOString()) : toLocalInput(end.toISOString(), timezone);
      next.all_day = allDay;
    }
    endOverridden.current = false;
    setEditing(null); setEditScope("single"); setSeriesParentId(null); setDraft(next); setConflicts([]); setAllowConflict(false); setStale(false); setDraftHint(""); setMessage(""); setOpen(true);
  }
  function startCreateForDate(dateKey: string) {
    const next = blankDraft(categories[0]?.id ?? "", timezone, defaultReminders, defaultDurationMinutes);
    next.starts_at = `${dateKey}T${next.starts_at.slice(11)}`;
    next.ends_at = shiftLocalField(next.starts_at, defaultDurationMinutes * 60_000);
    endOverridden.current = false;
    setEditing(null); setEditScope("single"); setSeriesParentId(null); setDraft(next); setConflicts([]);
    setAllowConflict(false); setStale(false); setDraftHint(""); setMessage(""); setOpen(true);
  }
  function startQuickAdd(result: QuickAddResult) {
    const next = blankDraft(categories[0]?.id ?? "", timezone, defaultReminders, defaultDurationMinutes);
    next.title = result.title;
    next.location = result.location ?? "";
    if (result.dateKey || result.time) {
      const date = result.dateKey ?? next.starts_at.slice(0, 10);
      const time = result.time ?? next.starts_at.slice(11);
      next.starts_at = `${date}T${time}`;
      next.ends_at = shiftLocalField(next.starts_at, (result.durationMinutes ?? defaultDurationMinutes) * 60_000);
    }
    next.recurrence_frequency = result.recurrenceFrequency ?? "";
    endOverridden.current = false;
    setEditing(null); setEditScope("single"); setSeriesParentId(null); setDraft(next); setConflicts([]);
    setAllowConflict(false); setStale(false); setDraftHint(result.explanation); setMessage(""); setOpen(true);
  }
  async function openAppointmentEditor(item: Appointment | AppointmentOccurrence, occurrenceScope: boolean, deferScope = false) {
    const parentId = ("series_parent_id" in item ? item.series_parent_id : null) ?? item.series_id ?? null;
    const targetId = parentId && !occurrenceScope ? parentId : item.id;
    const [latest, parentResult] = await Promise.all([
      parentId && occurrenceScope && "is_generated_occurrence" in item && item.is_generated_occurrence
        ? Promise.resolve({ data: item })
        : supabase.from("appointments").select("*").eq("id", targetId).maybeSingle(),
      parentId && deferScope
        ? supabase.from("appointments").select("*").eq("id", parentId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const current = (latest.data ?? item) as Appointment;
    const parent = parentResult.data as Appointment | null;
    const shareResult = await supabase.from("appointment_shares").select("id,revoked_at,expires_at,updated_at")
      .eq("appointment_id", targetId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setShare(shareResult.data); setShareUrl("");
    setEditScope(parentId ? (occurrenceScope ? "occurrence" : "series") : "single");
    setDeferRecurringScope(Boolean(parentId && deferScope));
    setSeriesParentId(parentId);
    setEditingSeriesParent(parent);
    setEditing(current);
    endOverridden.current = true;
    const allDayRange = current.all_day ? allDayEditorRange(current) : null;
    const nextDraft = { title: current.title, category_id: current.category_id,
      starts_at: allDayRange?.start ?? toLocalInput(current.starts_at, timezone),
      ends_at: allDayRange?.end ?? toLocalInput(current.ends_at, timezone),
      all_day: current.all_day, location: current.location ?? "",
      public_notes: current.public_notes ?? "", private_notes: current.private_notes ?? "",
      recurrence_frequency: parentId && occurrenceScope ? (deferScope ? parent?.recurrence_frequency ?? "" : "") : current.recurrence_frequency ?? "",
      recurrence_interval: deferScope ? parent?.recurrence_interval ?? 1 : current.recurrence_interval ?? 1,
      recurrence_until: deferScope ? parent?.recurrence_until ?? "" : current.recurrence_until ?? "",
      reminder_minutes: current.reminder_minutes ?? [] } satisfies Draft;
    initialDraft.current = nextDraft;
    setDraft(nextDraft);
    setConflicts([]); setAllowConflict(false); setStale(false); setDraftHint(""); setMessage(""); setOpen(true);
  }
  function startEdit(item: Appointment | AppointmentOccurrence) {
    const parentId = ("series_parent_id" in item ? item.series_parent_id : null) ?? item.series_id ?? null;
    if (!parentId) return void openAppointmentEditor(item, false);
    void openAppointmentEditor(item, true, true);
  }
  const closeRecurringEditChoice = useCallback(() => {
    const trigger = recurringEditChoice?.trigger;
    setRecurringEditChoice(null);
    window.requestAnimationFrame(() => trigger?.focus());
  }, [recurringEditChoice]);
  useEffect(() => {
    if (!recurringEditChoice) return;
    const dialog = recurringChoiceRef.current;
    const buttons = dialog?.querySelectorAll<HTMLElement>("button") ?? [];
    buttons[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRecurringEditChoice(); return; }
      if (event.key !== "Tab" || !buttons.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener("keydown", keydown);
    return () => dialog?.removeEventListener("keydown", keydown);
  }, [closeRecurringEditChoice, recurringEditChoice]);
  const iso = (value: string, allDay: boolean, isEnd = false) => allDay
    ? isEnd ? allDayEndToUtc(value) : allDayStartToUtc(value)
    : localInputToUtc(value, timezone);
  async function save(event?: FormEvent, forceConflict = false,
    activeScope = editScope, activeEditing = editing, activeDraft = draft) {
    event?.preventDefault();
    saveContext.current = { scope: activeScope, editing: activeEditing, draft: activeDraft };
    if (pending || !navigator.onLine) {
      if (!navigator.onLine) setMessage("Reconnect before saving this appointment.");
      return;
    }
    const allDayRange = activeDraft.all_day ? allDayStorageRange(activeDraft.starts_at, activeDraft.ends_at) : null;
    const parsed = appointmentInput.safeParse({ ...activeDraft, starts_at: allDayRange?.starts_at ?? iso(activeDraft.starts_at, false),
      ends_at: allDayRange?.ends_at ?? iso(activeDraft.ends_at, false), timezone });
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? "Check the appointment.");
    if (activeDraft.recurrence_frequency && (!Number.isInteger(activeDraft.recurrence_interval) || activeDraft.recurrence_interval < 1 || activeDraft.recurrence_interval > 52)) {
      return setMessage("Repeat interval must be between 1 and 52.");
    }
    if (activeDraft.recurrence_until && activeDraft.recurrence_until < activeDraft.starts_at.slice(0, 10)) {
      return setMessage("Repeat end date cannot be before the first occurrence.");
    }
    if (activeScope === "series" && activeEditing
      && (activeEditing.recurrence_frequency !== (activeDraft.recurrence_frequency || null)
        || activeEditing.recurrence_interval !== (activeDraft.recurrence_frequency ? activeDraft.recurrence_interval : null)
        || activeEditing.recurrence_until !== (activeDraft.recurrence_until || null))
      && !window.confirm("Changing this recurrence rule may make existing exceptions unreachable. Existing exceptions will be preserved. Continue?")) return;
    setPending(true); setMessage("");
    const payload = { user_id: userId, ...parsed.data,
      kind: activeEditing?.kind ?? "personal", contact_id: activeEditing?.contact_id ?? null, status: activeEditing?.status ?? "pending",
      reminder_minutes: normalizeReminderMinutes(activeDraft.reminder_minutes),
      location: parsed.data.location || null, phone: activeEditing?.phone ?? null, email: activeEditing?.email ?? null,
      public_notes: parsed.data.public_notes || null, private_notes: parsed.data.private_notes || null,
      intended_local_start: allDayRange?.intended_local_start ?? activeDraft.starts_at.replace("T", " "),
      intended_local_end: allDayRange?.intended_local_end ?? activeDraft.ends_at.replace("T", " "),
      completed_at: activeEditing?.completed_at ?? null,
      cancelled_at: activeEditing?.cancelled_at ?? null,
      recurrence_frequency: activeScope === "occurrence" ? null : activeDraft.recurrence_frequency || null,
      recurrence_interval: activeScope === "occurrence" || !activeDraft.recurrence_frequency ? null : activeDraft.recurrence_interval,
      recurrence_until: activeScope === "occurrence" || !activeDraft.recurrence_frequency ? null : activeDraft.recurrence_until || null,
      recurrence_count: null };
    const candidate = { id: activeEditing?.id ?? "new", starts_at: parsed.data.starts_at, ends_at: parsed.data.ends_at };
    let conflictRows: Appointment[] = [];
    if (payload.recurrence_frequency) {
      const horizonEnd = payload.recurrence_until
        ? new Date(`${payload.recurrence_until}T23:59:59Z`)
        : new Date(new Date(payload.starts_at).getTime() + 365 * 864e5);
      const [singleRows, seriesRows] = await Promise.all([
        supabase.from("appointments").select("*").is("series_id", null).is("recurrence_frequency", null)
          .lt("starts_at", horizonEnd.toISOString()).gt("ends_at", payload.starts_at)
          .neq("status", "cancelled").limit(500),
        supabase.from("appointments").select("*").is("series_id", null).not("recurrence_frequency", "is", null)
          .lt("starts_at", horizonEnd.toISOString()).limit(200),
      ]);
      const ids = (seriesRows.data ?? []).map((item) => item.id);
      const exceptionRows = ids.length ? await supabase.from("appointments").select("*").in("series_id", ids).limit(500) : { data: [] };
      const ownSeries = activeScope === "series" ? activeEditing?.id : null;
      const existing = [...(singleRows.data ?? []), ...(seriesRows.data ?? []), ...(exceptionRows.data ?? [])]
        .filter((item) => !ownSeries || (item.id !== ownSeries && item.series_id !== ownSeries)) as Appointment[];
      const recurringConflicts = findRecurringConflicts(
        [{ ...(activeEditing ?? {}), ...payload, id: activeEditing?.id ?? "new", series_id: null, original_occurrence_start: null } as Appointment],
        existing, payload.starts_at, horizonEnd.toISOString(),
      );
      const directConflicts = existing.filter((item) => findConflicts(candidate, [item]).length);
      conflictRows = [...recurringConflicts, ...directConflicts]
        .filter((item, index, rows) => rows.findIndex((value) =>
          value.id === item.id && value.starts_at === item.starts_at) === index);
    } else {
      const [overlapResult, seriesResult] = await Promise.all([
        supabase.from("appointments").select("*").is("series_id", null).is("recurrence_frequency", null)
          .lt("starts_at", candidate.ends_at).gt("ends_at", candidate.starts_at).neq("status", "cancelled"),
        supabase.from("appointments").select("*").is("series_id", null).not("recurrence_frequency", "is", null)
          .lt("starts_at", candidate.ends_at)
          .or(`recurrence_until.is.null,recurrence_until.gte.${candidate.starts_at.slice(0, 10)}`).limit(200),
      ]);
      const seriesIds = (seriesResult.data ?? []).map((item) => item.id);
      const exceptionResult = seriesIds.length
        ? await supabase.from("appointments").select("*").in("series_id", seriesIds).limit(500)
        : { data: [], error: null };
      const existing = [...(overlapResult.data ?? []), ...(seriesResult.data ?? []), ...(exceptionResult.data ?? [])]
        .filter((item) => !seriesParentId || (item.id !== seriesParentId && item.series_id !== seriesParentId)) as Appointment[];
      conflictRows = findRecurringConflicts(
        [{ ...(activeEditing ?? {}), ...payload, id: activeEditing?.id ?? "new", series_id: null,
          original_occurrence_start: null } as Appointment],
        existing, candidate.starts_at, candidate.ends_at,
      );
    }
    const found = conflictRows;
    if (found.length && !allowConflict && !forceConflict) {
      setConflicts(found);
      setPending(false); return;
    }
    const isGenerated = activeEditing && "is_generated_occurrence" in activeEditing && activeEditing.is_generated_occurrence;
    const occurrencePayload = activeScope === "occurrence" ? {
      ...payload, series_id: seriesParentId,
      original_occurrence_start: activeEditing?.original_occurrence_start ?? activeEditing?.starts_at ?? null,
    } : { ...payload, series_id: null, original_occurrence_start: null };
    const result = activeEditing
      ? activeScope === "occurrence" && isGenerated
        ? await supabase.from("appointments").insert(occurrencePayload).select("*").single()
        : await supabase.from("appointments").update(occurrencePayload).eq("id", activeEditing.id).eq("updated_at", activeEditing.updated_at).select("*").maybeSingle()
      : await supabase.from("appointments").insert(occurrencePayload).select("*").single();
    setPending(false);
    if (result.error) {
      if (activeScope === "occurrence" && isGenerated && result.error.code === "23505") {
        setStale(true);
        return setMessage("This occurrence changed on another device. Reload the latest version before saving.");
      }
      const { data: sessionData } = await supabase.auth.getSession();
      return setMessage(sessionData.session
        ? appointmentError(result.error)
        : "Your session expired. Sign in again before saving.");
    }
    if (!result.data) { setStale(true); return setMessage("This appointment was changed on another device. Reload the latest version before saving."); }
    setOpen(false); setAllowConflict(false); setRefreshKey((value) => value + 1); void load();
  }
  async function patch(item: Appointment, values: Partial<Appointment>) {
    if (!navigator.onLine) return setMessage("Reconnect before changing this appointment.");
    const { data, error } = await supabase.from("appointments").update(values)
      .eq("id", item.id).eq("updated_at", item.updated_at).select("*").maybeSingle();
    if (error) { setMessage(appointmentError(error)); return null; }
    if (!data) { setStale(true); setMessage("This appointment was changed on another device. Reload the latest version before saving."); return null; }
    setEditing(data as Appointment); setMessage("Appointment updated."); setRefreshKey((value) => value + 1); void load();
    return data as Appointment;
  }
  async function createShare() {
    if (!editing || pending) return;
    const expiryInput = window.prompt("Optional expiration date (YYYY-MM-DD), or leave blank:");
    if (expiryInput === null) return;
    const expiry = expiryInput ? new Date(`${expiryInput}T23:59:59Z`).toISOString() : null;
    setPending(true);
    const { data: token, error } = await supabase.rpc("create_appointment_share", {
      target_appointment_id: seriesParentId ?? editing.id, show_location: shareLocation, show_public_notes: shareNotes, expiry,
    });
    setPending(false);
    if (error || !token) return setMessage("The sharing link could not be created.");
    const url = `${window.location.origin}/share/${token}`;
    setShareUrl(url);
    const latest = await supabase.from("appointment_shares").select("id,revoked_at,expires_at,updated_at")
      .eq("appointment_id", seriesParentId ?? editing.id).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).single();
    setShare(latest.data);
    await supabase.from("appointment_activity").insert({
      user_id: userId, appointment_id: seriesParentId ?? editing.id, action: "share_created",
    });
    setMessage("Sharing link created. Copy it now; PourAgenda does not store the public token.");
  }
  async function revokeShare() {
    if (!share) return;
    const result = await supabase.from("appointment_shares").update({ revoked_at: new Date().toISOString() })
      .eq("id", share.id).eq("updated_at", share.updated_at).select("id").maybeSingle();
    if (result.error || !result.data) return setMessage("The link changed elsewhere. Reload before revoking it.");
    await supabase.from("appointment_activity").insert({
      user_id: userId, appointment_id: seriesParentId ?? editing?.id ?? null, action: "share_revoked",
    });
    setShare(null); setShareUrl(""); setMessage("Sharing link revoked.");
  }
  async function regenerateShare() {
    if (!share) return;
    const revoked = await supabase.from("appointment_shares").update({ revoked_at: new Date().toISOString() })
      .eq("id", share.id).eq("updated_at", share.updated_at).select("id").maybeSingle();
    if (revoked.error || !revoked.data) return setMessage("The link changed elsewhere. Reload before regenerating it.");
    setShare(null); setShareUrl("");
    await createShare();
  }
  async function undoablePatch(item: Appointment, values: Partial<Appointment>, previous: Partial<Appointment>, label: string) {
    setUndo(null);
    const updated = await patch(item, values);
    if (updated) { setUndo({ item: updated, previous, label }); setOpen(false); }
  }
  async function undoLastAction() {
    if (!undo) return;
    let current = undo.item;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase.from("appointments").update(undo.previous)
        .eq("id", current.id).eq("updated_at", current.updated_at).select("*").maybeSingle();
      if (error) break;
      if (data) {
        setEditing(data as Appointment);
        setUndo(null);
        setMessage(`${undo.label} undone.`);
        setRefreshKey((value) => value + 1);
        void load();
        return;
      }
      const latest = await supabase.from("appointments").select("*").eq("id", current.id).single();
      if (latest.error || !latest.data) break;
      current = latest.data as Appointment;
    }
    setUndo(null);
    setMessage("Undo failed. The latest server state was refreshed.");
    setRefreshKey((value) => value + 1);
  }
  async function reloadLatest() {
    if (!editing) return;
    const query = editScope === "occurrence" && seriesParentId && editing.original_occurrence_start
      ? supabase.from("appointments").select("*").eq("series_id", seriesParentId)
          .eq("original_occurrence_start", editing.original_occurrence_start).single()
      : supabase.from("appointments").select("*").eq("id", editing.id).single();
    const { data, error } = await query;
    if (error) setMessage(appointmentError(error));
    else {
      setEditing(data as Appointment);
      setStale(false);
      setMessage("Latest version loaded. Your unsaved form values are preserved.");
      setRefreshKey((value) => value + 1);
    }
  }
  async function cancelItem(item: Appointment | AppointmentOccurrence, scope = editScope) {
    const now = new Date().toISOString();
    if (scope === "occurrence" && "is_generated_occurrence" in item && item.is_generated_occurrence) {
      const { occurrence_id: _occurrenceId, series_parent_id: parentId, is_generated_occurrence: _generated, ...databaseItem } = item;
      void _occurrenceId; void _generated;
      const { data, error } = await supabase.from("appointments").insert({
        ...databaseItem, id: undefined, status: "cancelled", cancelled_at: now,
        recurrence_frequency: null, recurrence_interval: null, recurrence_until: null, recurrence_count: null,
        series_id: parentId, original_occurrence_start: item.original_occurrence_start,
      }).select("*").single();
      if (error) setMessage(appointmentError(error));
      else { setEditing(data as Appointment); setOpen(false); setMessage("This occurrence was cancelled."); setRefreshKey((value) => value + 1); void load(); }
      return;
    }
    if (scope === "series"
      && !window.confirm(`Cancel the entire recurring series “${item.title}”?`)) return;
    await undoablePatch(item, { status: "cancelled", cancelled_at: now }, undoAppointmentValues(item), scope === "series" ? "Recurring series cancelled." : "Appointment cancelled.");
  }
  async function skipPreviewOccurrence(item: RecurrencePreviewItem) {
    const occurrence = item.occurrence;
    const { id: _rowId, occurrence_id: _id, series_parent_id, is_generated_occurrence: _generated,
      created_at: _createdAt, updated_at: _updatedAt, ...row } = occurrence;
    void _rowId; void _id; void _generated; void _createdAt; void _updatedAt;
    if (!series_parent_id) { setMessage("This occurrence is not attached to a saved series."); return; }
    const { error } = await supabase.from("appointments").upsert({ ...row,
      status: "cancelled", cancelled_at: new Date().toISOString(), recurrence_frequency: null,
      recurrence_interval: null, recurrence_until: null, recurrence_count: null,
      series_id: series_parent_id, original_occurrence_start: item.originalStartsAt },
    { onConflict: "series_id,original_occurrence_start" });
    if (error) setMessage(appointmentError(error)); else { setMessage("Occurrence skipped."); await load(); }
  }
  async function restorePreviewOccurrence(item: RecurrencePreviewItem) {
    if (!item.exception) return;
    const { data, error } = await supabase.from("appointments").delete().eq("id", item.exception.id)
      .eq("updated_at", item.exception.updated_at).select("id");
    if (error) setMessage(appointmentError(error)); else if (!data?.length) setMessage("This occurrence changed on another device. Refresh and try again.");
    else { setMessage("Occurrence restored."); await load(); }
  }
  function editPreviewOccurrence(item: RecurrencePreviewItem) {
    setOpen(false);
    void openAppointmentEditor(item.occurrence, true);
  }
  async function remove(item: Appointment | AppointmentOccurrence, scope = editScope, confirmed = false) {
    if (scope === "occurrence" && "is_generated_occurrence" in item && item.is_generated_occurrence) {
      if (!confirmed && !window.confirm(`Remove only this occurrence of “${item.title}”? The series will remain.`)) return;
      await cancelItem(item, scope);
      return;
    }
    const scopeLabel = scope === "series" ? "entire recurring series" : "appointment";
    if (!confirmed && !window.confirm(`Permanently delete the ${scopeLabel} “${item.title}”? This cannot be undone.`)) return;
    const { data, error } = await supabase.from("appointments").delete()
      .eq("id", item.id).eq("updated_at", item.updated_at).select("id");
    if (error) setMessage(appointmentError(error));
    else if (!data?.length) setMessage("This appointment changed on another device. Refresh and try again.");
    else { setOpen(false); setMessage("Appointment permanently deleted."); setRefreshKey((value) => value + 1); void load(); }
  }
  const seriesDraft = (parent: Appointment) => {
    const first = initialDraft.current ?? draft;
    const parentRange = parent.all_day ? allDayEditorRange(parent) : null;
    const parentStart = parentRange?.start ?? toLocalInput(parent.starts_at, timezone);
    const parentEnd = parentRange?.end ?? toLocalInput(parent.ends_at, timezone);
    if (parent.all_day !== draft.all_day || first.all_day !== draft.all_day) return draft;
    const shiftValue = (value: string, milliseconds: number) => draft.all_day
      ? new Date(Date.parse(`${value.slice(0, 10)}T00:00:00Z`) + milliseconds).toISOString().slice(0, 10)
      : shiftLocalField(value, milliseconds);
    const valueMilliseconds = (value: string) => draft.all_day
      ? Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
      : localFieldMilliseconds(value);
    return { ...draft,
      starts_at: shiftValue(parentStart, valueMilliseconds(draft.starts_at) - valueMilliseconds(first.starts_at)),
      ends_at: shiftValue(parentEnd, valueMilliseconds(draft.ends_at) - valueMilliseconds(first.ends_at)),
    };
  };
  async function chooseRecurringScope(scope: "occurrence" | "series") {
    const choice = recurringEditChoice;
    if (!choice) return;
    setRecurringEditChoice(null);
    if (scope === "occurrence") {
      setDeferRecurringScope(false); setEditScope("occurrence");
      if (choice.action === "save") await save(undefined, false, "occurrence", choice.item, draft);
      else await remove(choice.item, "occurrence", true);
      return;
    }
    const parent = editingSeriesParent ?? (seriesParentId
      ? (await supabase.from("appointments").select("*").eq("id", seriesParentId).maybeSingle()).data as Appointment | null
      : null);
    if (!parent) { setMessage("The recurring series could not be loaded."); return; }
    const nextDraft = seriesDraft(parent);
    setEditing(parent); setEditingSeriesParent(parent); setDraft(nextDraft); setDeferRecurringScope(false); setEditScope("series");
    if (choice.action === "save") await save(undefined, false, "series", parent, nextDraft);
    else await remove(parent, "series", true);
  }
  function requestSave(event: FormEvent) {
    event.preventDefault();
    if (deferRecurringScope && editing) {
      setRecurringEditChoice({ action: "save", item: editing, trigger: document.activeElement as HTMLElement | null });
      return;
    }
    void save();
  }
  function requestDelete() {
    if (deferRecurringScope && editing) {
      setRecurringEditChoice({ action: "delete", item: editing, trigger: document.activeElement as HTMLElement | null });
      return;
    }
    if (editing) void remove(editing);
  }
  async function move(id: string, start: Date, end: Date, revert: () => void) {
    const item = appointments.find((value) => value.occurrence_id === id);
    if (!item) return revert();
    if (item.series_parent_id && !window.confirm("Move or resize this occurrence only? The rest of the series will not change.")) return revert();
    const movedAllDayRange = item.all_day
      ? allDayStorageRange(start.toISOString().slice(0, 10), allDayEndToInput(end.toISOString()))
      : null;
    const candidate = { id, starts_at: movedAllDayRange?.starts_at ?? start.toISOString(), ends_at: movedAllDayRange?.ends_at ?? end.toISOString() };
    if (findConflicts(candidate, appointments).length && !window.confirm("This time overlaps another appointment. Save anyway?")) return revert();
    const values = {
      starts_at: candidate.starts_at, ends_at: candidate.ends_at,
      intended_local_start: movedAllDayRange?.intended_local_start ?? toLocalInput(candidate.starts_at, timezone).replace("T", " "),
      intended_local_end: movedAllDayRange?.intended_local_end ?? toLocalInput(candidate.ends_at, timezone).replace("T", " "),
    };
    const { occurrence_id: _occurrenceId, series_parent_id: _seriesParentId, is_generated_occurrence: _generated, ...databaseItem } = item;
    void _occurrenceId; void _seriesParentId; void _generated;
    const mutation = item.series_parent_id && item.is_generated_occurrence
      ? supabase.from("appointments").insert({ ...databaseItem, ...values, id: undefined,
          recurrence_frequency: null, recurrence_interval: null, recurrence_until: null, recurrence_count: null,
          series_id: item.series_parent_id, original_occurrence_start: item.original_occurrence_start }).select("*").single()
      : supabase.from("appointments").update(values).eq("id", item.id).eq("updated_at", item.updated_at).select("*").maybeSingle();
    const { data: saved, error } = await mutation;
    if (error || !saved) {
      revert();
      setMessage(error ? appointmentError(error) : "This appointment changed on another device. Its original time was restored.");
    }
    void load();
  }

  const calendarEvents = useMemo(
    () => buildCalendarEvents(appointments, categories),
    [appointments, categories],
  );
  const globalSearchEvents = useMemo(() => {
    const combined: (Appointment | AppointmentOccurrence)[] = [...appointments, ...searchCatalog];
    const seen = new Set<string>();
    return combined.flatMap((item): SearchableEvent[] => {
      const id = "occurrence_id" in item ? item.occurrence_id : item.id;
      const identity = `${id}:${item.starts_at}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      const categoryData = categories.find((value) => value.id === item.category_id);
      return [{
        id,
        title: item.title,
        startsAt: item.starts_at,
        allDay: item.all_day,
        category: categoryData?.name ?? "Other",
        categoryColor: categoryData?.color ?? "#667168",
        location: item.location,
        notes: [item.public_notes, item.private_notes].filter(Boolean).join(" · "),
        source: item,
      }];
    });
  }, [appointments, categories, searchCatalog]);
  const upcomingAppointments = appointments
    .filter((item) => item.status !== "cancelled"
      && (!appointmentsLoadedAt || new Date(item.ends_at).getTime() >= appointmentsLoadedAt))
    .slice(0, 3);
  const hasLoadedCalendar = appointmentsLoadedAt > 0;
  const filterCount = activeFilterCount("all", category, search);
  const filterControls = <div className="space-y-3">
    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search appointments" aria-label="Search appointments" className="w-full rounded-lg border border-border bg-background px-3"/>
    <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter" className="w-full rounded-lg border border-border bg-background px-3"><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <button type="button" onClick={() => { setCategory("all"); setSearch(""); }} className="w-full rounded-lg border border-border px-3">Clear all</button>
  </div>;

  return <main className="min-h-dvh overflow-x-hidden xl:grid xl:grid-cols-[248px_minmax(0,1fr)_340px]">
    <aside className="hidden border-r border-border bg-surface p-5 xl:block">
      <div className="mb-7 flex items-center gap-3 text-xl font-semibold"><Image src="/icon.svg" alt="" width={40} height={40} className="rounded-lg"/>PourAgenda</div>
      <button type="button" onClick={() => startCreate()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white"><Plus size={18} aria-hidden="true"/>New appointment</button>
      <button onClick={() => setView("calendar")} aria-pressed={view === "calendar"} className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 hover:bg-background"><CalendarDays size={18}/>Calendar</button>
      <button onClick={() => setView("lists")} aria-pressed={view === "lists"} className="flex w-full items-center gap-3 rounded-lg px-3 hover:bg-background"><List size={18}/>Appointment lists</button>
      <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 hover:bg-background"><Settings size={18}/>Settings</Link>
      <div className="mt-7 space-y-3 border-t border-border pt-5">
        {filterControls}
      </div>
      <div className="mt-8 border-t border-border pt-5"><p className="mb-2 truncate text-xs text-muted">{email}</p><SignOutButton /></div>
    </aside>
    <section className="mobile-content-clearance min-w-0 xl:pb-0">
      <header className="mobile-safe-inline flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 xl:px-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Schedule</p><h1 className="mobile-page-title font-semibold">{view === "calendar" ? "Your calendar" : "Appointment lists"}</h1></div><div className="flex shrink-0 gap-2"><button type="button" onClick={openGlobalSearch} className="grid size-11 place-items-center rounded-full border border-border" aria-label="Search events"><Search aria-hidden="true"/></button><button type="button" onClick={() => setFilterOpen(true)} className="relative grid size-11 place-items-center rounded-full border border-border xl:hidden" aria-label={`Filters${filterCount ? `, ${filterCount} active` : ""}`}><Filter aria-hidden="true"/>{filterCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] text-white">{filterCount}</span>}</button><button type="button" onClick={() => startCreate()} className="grid size-11 place-items-center rounded-full border border-primary bg-surface text-primary" aria-label="New appointment"><Plus aria-hidden="true"/></button></div></header>
      {message && <p role="status" className="m-3 rounded-lg border border-border bg-surface p-3 text-sm">{message}</p>}
      {!online && <p role="status" className="m-3 rounded-lg border border-amber-700 bg-surface p-3 text-sm">You’re offline. Previously loaded appointments remain visible, but changes are blocked until you reconnect.</p>}
      {view === "calendar" ? <>
        {calendarLoading && !hasLoadedCalendar && <div className="mobile-calendar-stage px-4 py-2.5 lg:p-6"><div className="calendar-loading-shell" role="status" aria-label="Loading appointments" aria-live="polite"><span className="sr-only">Loading appointments…</span><span className="calendar-loading-title"/><span className="calendar-loading-controls"/><span className="calendar-loading-grid"/></div></div>}
        {!calendarLoading && calendarLoadError && <div className="mobile-calendar-stage px-4 pt-2.5 lg:px-6"><div className="calendar-error-card" role="alert"><div><strong>Calendar unavailable</strong><p>{calendarLoadError}</p></div><button type="button" onClick={() => void load()}>Try again</button></div></div>}
        {(!calendarLoadError || hasLoadedCalendar) && !calendarLoading && <div className="mobile-calendar-stage relative px-4 py-2.5 lg:p-6" aria-busy={calendarRefreshing}>{calendarRefreshing && <span role="status" className="absolute right-8 top-8 z-10 rounded bg-surface px-2 text-sm text-muted">Refreshing…</span>}{calendarView === "dayGridMonth" && <QuickAdd timezone={timezone} onParsed={startQuickAdd}/>}<Calendar events={calendarEvents} dataLoadedAt={appointmentsLoadedAt} timezone={timezone} timeFormat={timeFormat} onRange={updateRange} onViewChange={setCalendarView} onSelect={startCreate} onCreateForDate={startCreateForDate} onOpen={(id) => { const item = appointments.find((value) => value.occurrence_id === id); if (item) startEdit(item); }} onMove={move}/></div>}
        {calendarView === "dayGridMonth" && !calendarLoading && (!calendarLoadError || hasLoadedCalendar) && <section className="mobile-upcoming-stage px-4 pb-5 xl:hidden" aria-labelledby="mobile-upcoming-title"><div className="rounded-[var(--radius)] border border-border bg-surface p-4"><div className="flex items-center justify-between gap-4"><h2 id="mobile-upcoming-title" className="text-lg font-semibold">Upcoming</h2><button type="button" onClick={() => { setView("lists"); setListSection("upcoming"); }} className="min-h-11 text-sm font-semibold text-primary">View all</button></div>{upcomingAppointments.length === 0 ? <p className="mt-3 rounded-lg bg-background p-4 text-sm text-muted">No upcoming appointments in this range.</p> : <div className="mt-2 divide-y divide-border">{upcomingAppointments.map((item) => { const categoryData=categories.find((value)=>value.id===item.category_id); const date=new Date(item.starts_at); return <button type="button" key={item.occurrence_id} onClick={() => startEdit(item)} className="grid min-h-14 w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left"><span aria-hidden="true" className="size-2 rounded-full" style={{backgroundColor:categoryData?.color ?? "#667168"}}/><span className="min-w-0"><span className="block truncate text-[1rem] font-semibold">{item.title}</span><span className="block text-xs text-muted">{categoryData?.name ?? "Other"}</span></span><span className="text-right text-xs text-muted"><span className="block">{formatDate(date, timezone)}</span><span className="block">{item.all_day ? "All day" : formatTime(date, timezone, timeFormat)}</span></span></button>;})}</div>}</div></section>}
      </>
      : <div className="p-3 lg:p-6"><div className="mb-4 flex gap-2 overflow-x-auto pb-2" role="tablist">{appointmentListSections.map((item) => <button key={item} role="tab" aria-selected={listSection === item} onClick={() => setListSection(item)} className={`shrink-0 rounded-full border px-4 ${listSection === item ? "bg-primary text-white" : "border-border"}`}>{item === "this-week" ? "This week" : `${item[0].toUpperCase()}${item.slice(1)}`}</button>)}</div><AppointmentListPanel section={listSection} kind="all" category={category} search={search} timezone={timezone} timeFormat={timeFormat} refreshKey={refreshKey} onOpen={(item) => void startEdit(item)}/></div>}
    </section>
    <aside className="hidden border-l border-border bg-surface p-6 xl:block"><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Upcoming</p><div className="mt-5 space-y-3">{appointments.slice(0, 8).map((item) => { const categoryName=categories.find((value)=>value.id===item.category_id)?.name ?? "Other"; return <button key={item.occurrence_id} onClick={() => startEdit(item)} className="w-full rounded-lg border border-border p-3 text-left"><strong>{item.title}{item.series_parent_id ? " ↻" : ""}</strong><span className="mt-1 block text-xs text-muted">{formatDateTime(item.starts_at, timezone, timeFormat)} · {categoryName}</span></button>;})}</div></aside>
    <nav aria-label="Mobile navigation" className="safe-bottom mobile-safe-inline fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur xl:hidden"><button type="button" onClick={() => setView("calendar")} aria-current={view === "calendar" ? "page" : undefined} className={`mobile-nav-item ${view === "calendar" ? "text-primary" : ""}`}><CalendarDays aria-hidden="true"/>Calendar</button><button type="button" onClick={() => setView("lists")} aria-current={view === "lists" ? "page" : undefined} className={`mobile-nav-item ${view === "lists" ? "text-primary" : ""}`}><List aria-hidden="true"/>Lists</button><button type="button" onClick={() => startCreate()} className="mobile-nav-item"><span className="grid size-9 place-items-center rounded-full bg-primary text-white"><Plus size={21} aria-hidden="true"/></span>Create</button><Link href="/settings" className="mobile-nav-item"><Settings aria-hidden="true"/>Settings</Link></nav>

    {filterOpen && <div className="fixed inset-0 z-50 bg-black/40 xl:hidden" role="dialog" aria-modal="true" aria-label="Appointment filters"><div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Filters</h2><button onClick={() => setFilterOpen(false)} aria-label="Close filters"><X/></button></div>{filterControls}<button onClick={() => setFilterOpen(false)} className="mt-4 w-full rounded-lg bg-primary px-4 font-semibold text-white">Show results</button></div></div>}
    {globalSearchOpen && <GlobalEventSearch
      open={globalSearchOpen}
      events={globalSearchEvents}
      timezone={timezone}
      timeFormat={timeFormat}
      loading={searchCatalogLoading}
      error={searchCatalogError}
      online={online}
      onClose={() => setGlobalSearchOpen(false)}
      onRetry={() => void loadSearchCatalog()}
      onOpen={(item) => {
        setGlobalSearchOpen(false);
        void startEdit(item.source as Appointment | AppointmentOccurrence);
      }}
    />}
    {undo && <div className="mobile-undo-offset safe-bottom fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-foreground px-4 py-3 text-background shadow-xl" role="status"><span>{undo.label}</span><button type="button" onClick={() => void undoLastAction()} className="rounded-md border border-background px-3">Undo</button></div>}

    {recurringEditChoice && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div ref={recurringChoiceRef} role="dialog" aria-modal="true" aria-labelledby="recurring-edit-title" aria-describedby="recurring-edit-description" className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl"><h2 id="recurring-edit-title" className="text-xl font-semibold">{recurringEditChoice.action === "save" ? "Save recurring appointment" : "Delete recurring appointment"}</h2><div id="recurring-edit-description" className="mt-2 text-sm text-muted"><p>This appointment is part of a recurring series.</p><p>{recurringEditChoice.action === "save" ? "What would you like to save?" : "What would you like to delete?"}</p></div><div className="mt-5 grid gap-2"><button type="button" className="rounded-lg bg-primary px-4 py-3 font-semibold text-white" onClick={() => void chooseRecurringScope("occurrence")}>{recurringEditChoice.action === "save" ? "This appointment only" : "Delete this appointment only"}</button><button type="button" className="rounded-lg border border-border px-4 py-3" onClick={() => void chooseRecurringScope("series")}>{recurringEditChoice.action === "save" ? "Entire series" : "Delete entire series"}</button><button type="button" className="rounded-lg border border-border px-4 py-3" onClick={closeRecurringEditChoice}>Cancel</button></div></div></div>}
    {open && <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={editing ? "Edit appointment" : "Create appointment"}><form onSubmit={requestSave} className="mx-auto max-w-2xl rounded-xl bg-surface p-5 shadow-xl sm:p-7">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">{editing ? "Appointment details" : "New appointment"}</h2>{deferRecurringScope && <p className="text-sm text-muted">Recurring appointment</p>}{!deferRecurringScope && editScope === "series" && <p className="text-sm text-muted">Editing the entire recurring series</p>}{!deferRecurringScope && editScope === "occurrence" && <p className="text-sm text-muted">Editing this occurrence only</p>}</div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X/></button></div>
      {draftHint && <p role="status" className="mt-4 rounded-lg bg-background p-3 text-sm text-muted">{draftHint}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">Title<input required maxLength={180} value={draft.title} onChange={(e) => setDraft({...draft,title:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
        <label className="sm:col-span-2">Category<select required value={draft.category_id} onChange={(e) => setDraft({...draft,category_id:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3">{categories.filter((item) => !item.hidden || item.id === draft.category_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={draft.all_day} onChange={(e) => { const all_day=e.target.checked; setDraft({...draft,all_day,starts_at:!all_day&&!draft.starts_at.includes("T")?`${draft.starts_at}T09:00`:draft.starts_at,ends_at:!all_day&&!draft.ends_at.includes("T")?`${draft.ends_at}T10:00`:draft.ends_at}); }}/>All-day appointment</label>
        <div><span className="font-medium">Start</span><EnglishDateTimePicker ariaLabel="Start" value={draft.starts_at} dateOnly={draft.all_day} timeFormat={timeFormat} onChange={(start) => { if(endOverridden.current) return setDraft({...draft,starts_at:start}); const duration=localFieldMilliseconds(draft.ends_at)-localFieldMilliseconds(draft.starts_at); const end=draft.all_day ? start : shiftLocalField(start,duration > 0 ? duration : defaultDurationMinutes * 60_000); setDraft({...draft,starts_at:start,ends_at:end}); }}/></div>
        <div><span className="font-medium">End</span><EnglishDateTimePicker ariaLabel="End" value={draft.ends_at} dateOnly={draft.all_day} timeFormat={timeFormat} min={draft.starts_at} describedBy="event-range-error" onChange={(ends_at) => { endOverridden.current=true; setDraft({...draft,ends_at}); }}/>{draft.ends_at < draft.starts_at && <span id="event-range-error" role="alert" className="mt-1 block text-sm text-red-700">End must not be earlier than Start.</span>}</div>
        <label>Location<input value={draft.location} onChange={(e) => setDraft({...draft,location:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
        {(editScope !== "occurrence" || deferRecurringScope) && <RecurrenceEditor appointment={{...(deferRecurringScope && editingSeriesParent ? editingSeriesParent : editing), id: deferRecurringScope && editingSeriesParent ? editingSeriesParent.id : editing?.id ?? "draft", starts_at:iso(draft.starts_at,draft.all_day), ends_at:iso(draft.ends_at,draft.all_day,true), intended_local_start:draft.starts_at, intended_local_end:draft.ends_at, timezone, all_day:draft.all_day, status:editing?.status ?? "pending", recurrence_frequency:draft.recurrence_frequency || null, recurrence_interval:draft.recurrence_interval, recurrence_until:draft.recurrence_until || null} as Appointment} exceptions={editing ? recurrenceRows.filter((row)=>row.series_id===(deferRecurringScope ? editingSeriesParent?.id : editing.id)) : []} frequency={draft.recurrence_frequency} interval={draft.recurrence_interval} until={draft.recurrence_until} timezone={timezone} persisted={Boolean((deferRecurringScope ? editingSeriesParent?.id : editing?.id) && draft.recurrence_frequency)} onFrequency={(recurrence_frequency,recurrence_interval)=>setDraft({...draft,recurrence_frequency,recurrence_interval})} onInterval={(recurrence_interval)=>setDraft({...draft,recurrence_interval})} onUntil={(recurrence_until)=>setDraft({...draft,recurrence_until})} onSkip={skipPreviewOccurrence} onRestore={restorePreviewOccurrence} onEdit={editPreviewOccurrence} onMove={editPreviewOccurrence}/>}
        <fieldset className="min-w-0 rounded-lg border border-border p-3 sm:col-span-2"><legend className="px-1 font-semibold">Reminders</legend><div className="flex flex-wrap gap-4">{REMINDER_OPTIONS.map((option)=><label key={option.value} className="flex items-center gap-2"><input aria-label={option.value === 0 ? "Reminder when event begins" : `Reminder ${option.label.toLowerCase()}`} type="checkbox" checked={draft.reminder_minutes.includes(option.value)} onChange={(e)=>setDraft({...draft,reminder_minutes:normalizeReminderMinutes(e.target.checked?[...draft.reminder_minutes,option.value]:draft.reminder_minutes.filter((value)=>value!==option.value))})}/><span aria-hidden="true">{option.label}</span></label>)}</div><p className="mt-2 text-sm text-muted">Browser notifications are best effort and only used when permission has been granted.</p></fieldset>
        <label className="sm:col-span-2">Notes<textarea value={draft.public_notes} onChange={(e) => setDraft({...draft,public_notes:e.target.value})} className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-3"/></label>
        {editing && <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2"><legend className="px-1 font-semibold">Public read-only sharing</legend>
          <p className="text-sm text-muted">{share ? "An active link exists for this appointment." : "No active sharing link."}</p>
          {!share && <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input aria-label="Show venue publicly" type="checkbox" checked={shareLocation} onChange={(e)=>setShareLocation(e.target.checked)}/><span aria-hidden="true">Show location</span></label><label className="flex items-center gap-2"><input type="checkbox" checked={shareNotes} onChange={(e)=>setShareNotes(e.target.checked)}/>Show public notes</label></div>}
          {shareUrl && <div><label className="sr-only" htmlFor="share-url">Public URL</label><input id="share-url" readOnly value={shareUrl} className="w-full rounded-lg border border-border bg-background px-3"/><button type="button" onClick={async()=>{await navigator.clipboard.writeText(shareUrl);setMessage("Link copied.");}} className="mt-2 rounded-lg border border-border px-3">Copy link</button></div>}
          <div className="flex gap-2">{!share && <button type="button" onClick={()=>void createShare()} className="rounded-lg border border-border px-3">Create sharing link</button>}{share && <><button type="button" onClick={()=>void revokeShare()} className="rounded-lg border border-red-700 px-3 text-red-700">Revoke link</button><button type="button" onClick={()=>void regenerateShare()} className="rounded-lg border border-border px-3">Regenerate</button></>}</div>
        </fieldset>}
      </div>
      {conflicts.length > 0 && !allowConflict && <div role="alert" className="mt-4 rounded-lg border border-amber-600 p-3"><strong>Time conflict</strong>{conflicts.map((item) => <p key={item.id} className="text-sm">{item.title}: {formatDateTime(item.starts_at, timezone, timeFormat)}–{formatTime(item.ends_at, timezone, timeFormat)}</p>)}<button type="button" onClick={() => { const context=saveContext.current; setAllowConflict(true); if(context) void save(undefined,true,context.scope,context.editing,context.draft); }} className="mt-2 rounded-lg border border-border px-3">Save anyway</button></div>}
      {message && <p role={stale ? "alert" : "status"} className="mt-4 text-sm">{message}</p>}
      {stale && <button type="button" onClick={() => void reloadLatest()} className="mt-2 rounded-lg border border-border px-3">Reload latest appointment</button>}
      <div className="mt-6 flex flex-wrap gap-2"><button disabled={pending} className="rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save appointment"}</button>
        {editing && <button type="button" onClick={requestDelete} className="ml-auto flex items-center gap-1 rounded-lg border border-red-700 px-3 text-red-700"><Trash2 size={17}/>Delete permanently</button>}
      </div>
    </form></div>}
  </main>;
}
