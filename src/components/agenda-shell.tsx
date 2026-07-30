"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CalendarDays, Filter, List, Plus, RotateCcw, Settings, Trash2, X } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { AppointmentListPanel } from "@/components/appointment-list-panel";
import { allDayEndToInput, allDayEndToUtc, appointmentError, appointmentInput, findConflicts, localInputToUtc, toLocalInput, undoAppointmentValues } from "@/lib/appointments";
import { activeFilterCount, appointmentListSections, type AppointmentListSection } from "@/lib/appointment-lists";
import { expandAppointments, findRecurringConflicts, recurrenceSummary } from "@/lib/recurrence";
import { REMINDER_OPTIONS, normalizeReminderMinutes, reminderTimes } from "@/lib/reminders";
import { createClient } from "@/lib/supabase/client";
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
const contrastingText = (color: string) => {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#17211d" : "#ffffff";
};
const localFieldMilliseconds = (value: string) => Date.parse(`${value}:00Z`);
const shiftLocalField = (value: string, milliseconds: number) =>
  new Date(localFieldMilliseconds(value) + milliseconds).toISOString().slice(0, 16);
type Draft = {
  title: string; category_id: string; starts_at: string; ends_at: string;
  all_day: boolean; location: string; public_notes: string; private_notes: string; recurrence_frequency: RecurrenceFrequency | "";
  recurrence_interval: number; recurrence_until: string;
  reminder_minutes: number[];
};
const blankDraft = (categoryId: string, timezone: string, reminders: number[]): Draft => {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { title: "", category_id: categoryId, starts_at: toLocalInput(start.toISOString(), timezone),
    ends_at: toLocalInput(end.toISOString(), timezone), all_day: false, location: "",
    public_notes: "", private_notes: "", recurrence_frequency: "", recurrence_interval: 1,
    recurrence_until: "", reminder_minutes: reminders };
};

export function AgendaShell({ email, userId, timezone, defaultReminders, categories }: {
  email: string; userId: string; timezone: string; defaultReminders: number[]; categories: Category[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [appointments, setAppointments] = useState<AppointmentOccurrence[]>([]);
  const [range, setRange] = useState({ start: new Date(0), end: new Date(864e5) });
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(() => blankDraft(categories[0]?.id ?? "", timezone, defaultReminders));
  const [editing, setEditing] = useState<Appointment | AppointmentOccurrence | null>(null);
  const [editScope, setEditScope] = useState<"single" | "series" | "occurrence">("single");
  const [seriesParentId, setSeriesParentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
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
  const calendarLoaded = useRef(false);
  const calendarLoadGeneration = useRef(0);
  const endOverridden = useRef(false);
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
      const expanded = expandAppointments(
        [...(singleResult.data ?? []), ...(seriesResult.data ?? []), ...(exceptionResult.data ?? [])] as Appointment[],
        start, end,
      );
      const term = search.trim().toLowerCase();
      setAppointments(expanded.filter((item) => {
        if (category !== "all" && item.category_id !== category) return false;
        if (item.archived || item.status === "cancelled") return false;
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
          setMessage(`Reminder: ${item.title} starts ${new Date(item.starts_at).toLocaleString([], { timeZone: timezone })}.`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(item.title, { body: `Starts ${new Date(item.starts_at).toLocaleString([], { timeZone: timezone })}`, tag: identity });
          }
        }, delay));
      });
    }
    return () => timers.forEach(window.clearTimeout);
  }, [appointments, timezone]);

  function startCreate(start?: Date, end?: Date, allDay = false) {
    const next = blankDraft(categories[0]?.id ?? "", timezone, defaultReminders);
    if (start && end) {
      next.starts_at = allDay ? start.toISOString().slice(0, 10) : toLocalInput(start.toISOString(), timezone);
      next.ends_at = allDay ? allDayEndToInput(end.toISOString()) : toLocalInput(end.toISOString(), timezone);
      next.all_day = allDay;
    }
    endOverridden.current = false;
    setEditing(null); setEditScope("single"); setSeriesParentId(null); setDraft(next); setConflicts([]); setAllowConflict(false); setStale(false); setMessage(""); setOpen(true);
  }
  async function startEdit(item: Appointment | AppointmentOccurrence) {
    const parentId = ("series_parent_id" in item ? item.series_parent_id : null) ?? item.series_id ?? null;
    const occurrenceScope = parentId
      ? window.confirm("Edit this occurrence only?\n\nChoose Cancel to edit the entire recurring series.")
      : false;
    const targetId = parentId && !occurrenceScope ? parentId : item.id;
    const latest = parentId && occurrenceScope && "is_generated_occurrence" in item && item.is_generated_occurrence
      ? { data: item }
      : await supabase.from("appointments").select("*").eq("id", targetId).maybeSingle();
    const current = (latest.data ?? item) as Appointment;
    const shareResult = await supabase.from("appointment_shares").select("id,revoked_at,expires_at,updated_at")
      .eq("appointment_id", targetId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setShare(shareResult.data); setShareUrl("");
    setEditScope(parentId ? (occurrenceScope ? "occurrence" : "series") : "single");
    setSeriesParentId(parentId);
    setEditing(current);
    endOverridden.current = true;
    setDraft({ title: current.title, category_id: current.category_id,
      starts_at: current.all_day ? current.starts_at.slice(0, 10) : toLocalInput(current.starts_at, timezone),
      ends_at: current.all_day ? allDayEndToInput(current.ends_at) : toLocalInput(current.ends_at, timezone),
      all_day: current.all_day, location: current.location ?? "",
      public_notes: current.public_notes ?? "", private_notes: current.private_notes ?? "",
      recurrence_frequency: parentId && occurrenceScope ? "" : current.recurrence_frequency ?? "",
      recurrence_interval: current.recurrence_interval ?? 1, recurrence_until: current.recurrence_until ?? "",
      reminder_minutes: current.reminder_minutes ?? [] });
    setConflicts([]); setAllowConflict(false); setStale(false); setMessage(""); setOpen(true);
  }
  const iso = (value: string, allDay: boolean, isEnd = false) => allDay && isEnd ? allDayEndToUtc(value) : localInputToUtc(value, timezone, allDay);
  async function save(event?: FormEvent, forceConflict = false) {
    event?.preventDefault();
    if (pending || !navigator.onLine) {
      if (!navigator.onLine) setMessage("Reconnect before saving this appointment.");
      return;
    }
    const parsed = appointmentInput.safeParse({ ...draft, starts_at: iso(draft.starts_at, draft.all_day),
      ends_at: iso(draft.ends_at, draft.all_day, true), timezone });
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? "Check the appointment.");
    if (draft.recurrence_frequency && (!Number.isInteger(draft.recurrence_interval) || draft.recurrence_interval < 1 || draft.recurrence_interval > 52)) {
      return setMessage("Repeat interval must be between 1 and 52.");
    }
    if (draft.recurrence_until && draft.recurrence_until < draft.starts_at.slice(0, 10)) {
      return setMessage("Repeat end date cannot be before the first occurrence.");
    }
    if (editScope === "series" && editing
      && (editing.recurrence_frequency !== (draft.recurrence_frequency || null)
        || editing.recurrence_interval !== (draft.recurrence_frequency ? draft.recurrence_interval : null)
        || editing.recurrence_until !== (draft.recurrence_until || null))
      && !window.confirm("Changing this recurrence rule may make existing exceptions unreachable. Existing exceptions will be preserved. Continue?")) return;
    setPending(true); setMessage("");
    const payload = { user_id: userId, ...parsed.data,
      kind: editing?.kind ?? "personal", contact_id: editing?.contact_id ?? null, status: editing?.status ?? "pending",
      reminder_minutes: normalizeReminderMinutes(draft.reminder_minutes),
      location: parsed.data.location || null, phone: editing?.phone ?? null, email: editing?.email ?? null,
      public_notes: parsed.data.public_notes || null, private_notes: parsed.data.private_notes || null,
      intended_local_start: draft.starts_at.replace("T", " "), intended_local_end: draft.ends_at.replace("T", " "),
      completed_at: editing?.completed_at ?? null,
      cancelled_at: editing?.cancelled_at ?? null,
      recurrence_frequency: editScope === "occurrence" ? null : draft.recurrence_frequency || null,
      recurrence_interval: editScope === "occurrence" || !draft.recurrence_frequency ? null : draft.recurrence_interval,
      recurrence_until: editScope === "occurrence" || !draft.recurrence_frequency ? null : draft.recurrence_until || null,
      recurrence_count: null };
    const candidate = { id: editing?.id ?? "new", starts_at: parsed.data.starts_at, ends_at: parsed.data.ends_at };
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
      const ownSeries = editScope === "series" ? editing?.id : null;
      const existing = [...(singleRows.data ?? []), ...(seriesRows.data ?? []), ...(exceptionRows.data ?? [])]
        .filter((item) => !ownSeries || (item.id !== ownSeries && item.series_id !== ownSeries)) as Appointment[];
      const recurringConflicts = findRecurringConflicts(
        [{ ...(editing ?? {}), ...payload, id: editing?.id ?? "new", series_id: null, original_occurrence_start: null } as Appointment],
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
        [{ ...(editing ?? {}), ...payload, id: editing?.id ?? "new", series_id: null,
          original_occurrence_start: null } as Appointment],
        existing, candidate.starts_at, candidate.ends_at,
      );
    }
    const found = conflictRows;
    if (found.length && !allowConflict && !forceConflict) {
      setConflicts(found);
      setPending(false); return;
    }
    const isGenerated = editing && "is_generated_occurrence" in editing && editing.is_generated_occurrence;
    const occurrencePayload = editScope === "occurrence" ? {
      ...payload, series_id: seriesParentId,
      original_occurrence_start: editing?.original_occurrence_start ?? editing?.starts_at ?? null,
    } : { ...payload, series_id: null, original_occurrence_start: null };
    const result = editing
      ? editScope === "occurrence" && isGenerated
        ? await supabase.from("appointments").insert(occurrencePayload).select("*").single()
        : await supabase.from("appointments").update(occurrencePayload).eq("id", editing.id).eq("updated_at", editing.updated_at).select("*").maybeSingle()
      : await supabase.from("appointments").insert(occurrencePayload).select("*").single();
    setPending(false);
    if (result.error) {
      if (editScope === "occurrence" && isGenerated && result.error.code === "23505") {
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
  async function cancelItem(item: Appointment | AppointmentOccurrence) {
    const now = new Date().toISOString();
    if (editScope === "occurrence" && "is_generated_occurrence" in item && item.is_generated_occurrence) {
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
    if (editScope === "series"
      && !window.confirm(`Cancel the entire recurring series “${item.title}”?`)) return;
    await undoablePatch(item, { status: "cancelled", cancelled_at: now }, undoAppointmentValues("cancel", item), editScope === "series" ? "Recurring series cancelled." : "Appointment cancelled.");
  }
  async function remove(item: Appointment) {
    if (editScope === "occurrence" && "is_generated_occurrence" in item && item.is_generated_occurrence) {
      if (!window.confirm(`Remove only this occurrence of “${item.title}”? The series will remain.`)) return;
      await cancelItem(item);
      return;
    }
    const scope = editScope === "series" ? "entire recurring series" : "appointment";
    if (!window.confirm(`Permanently delete the ${scope} “${item.title}”? This cannot be undone.`)) return;
    const { data, error } = await supabase.from("appointments").delete()
      .eq("id", item.id).eq("updated_at", item.updated_at).select("id");
    if (error) setMessage(appointmentError(error));
    else if (!data?.length) setMessage("This appointment changed on another device. Refresh and try again.");
    else { setOpen(false); setMessage("Appointment permanently deleted."); setRefreshKey((value) => value + 1); void load(); }
  }
  async function move(id: string, start: Date, end: Date, revert: () => void) {
    const item = appointments.find((value) => value.occurrence_id === id);
    if (!item) return revert();
    if (item.series_parent_id && !window.confirm("Move or resize this occurrence only? The rest of the series will not change.")) return revert();
    const candidate = { id, starts_at: start.toISOString(), ends_at: end.toISOString() };
    if (findConflicts(candidate, appointments).length && !window.confirm("This time overlaps another appointment. Save anyway?")) return revert();
    const values = {
      starts_at: candidate.starts_at, ends_at: candidate.ends_at,
      intended_local_start: toLocalInput(candidate.starts_at, timezone).replace("T", " "),
      intended_local_end: toLocalInput(candidate.ends_at, timezone).replace("T", " "),
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

  const calendarEvents = appointments.map((item) => {
    const categoryData = categories.find((value) => value.id === item.category_id);
    const color = categoryData?.color ?? "#667168";
    return { id: item.occurrence_id, title: item.title, start: item.starts_at, end: item.ends_at,
      allDay: item.all_day, backgroundColor: color, borderColor: color, textColor: contrastingText(color),
      classNames: item.status === "cancelled" ? ["appointment-cancelled"] : [],
      extendedProps: { category: categoryData?.name ?? "Other", recurring: Boolean(item.series_parent_id) } };
  });
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
      <header className="mobile-safe-inline flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 xl:px-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Schedule</p><h1 className="mobile-page-title font-semibold">{view === "calendar" ? "Your calendar" : "Appointment lists"}</h1></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => setFilterOpen(true)} className="relative grid size-11 place-items-center rounded-full border border-border xl:hidden" aria-label={`Filters${filterCount ? `, ${filterCount} active` : ""}`}><Filter aria-hidden="true"/>{filterCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] text-white">{filterCount}</span>}</button><button type="button" onClick={() => startCreate()} className="grid size-11 place-items-center rounded-full border border-primary bg-surface text-primary" aria-label="New appointment"><Plus aria-hidden="true"/></button></div></header>
      {message && <p role="status" className="m-3 rounded-lg border border-border bg-surface p-3 text-sm">{message}</p>}
      {!online && <p role="status" className="m-3 rounded-lg border border-amber-700 bg-surface p-3 text-sm">You’re offline. Previously loaded appointments remain visible, but changes are blocked until you reconnect.</p>}
      {view === "calendar" ? <>
        {calendarLoading && !hasLoadedCalendar && <div className="mobile-calendar-stage px-4 py-2.5 lg:p-6"><div className="calendar-loading-shell" role="status" aria-label="Loading appointments" aria-live="polite"><span className="sr-only">Loading appointments…</span><span className="calendar-loading-title"/><span className="calendar-loading-controls"/><span className="calendar-loading-grid"/></div></div>}
        {!calendarLoading && calendarLoadError && <div className="mobile-calendar-stage px-4 pt-2.5 lg:px-6"><div className="calendar-error-card" role="alert"><div><strong>Calendar unavailable</strong><p>{calendarLoadError}</p></div><button type="button" onClick={() => void load()}>Try again</button></div></div>}
        {(!calendarLoadError || hasLoadedCalendar) && !calendarLoading && <div className="mobile-calendar-stage relative px-4 py-2.5 lg:p-6" aria-busy={calendarRefreshing}>{calendarRefreshing && <span role="status" className="absolute right-8 top-8 z-10 rounded bg-surface px-2 text-sm text-muted">Refreshing…</span>}<Calendar events={calendarEvents} dataLoadedAt={appointmentsLoadedAt} onRange={updateRange} onViewChange={setCalendarView} onSelect={startCreate} onOpen={(id) => { const item = appointments.find((value) => value.occurrence_id === id); if (item) startEdit(item); }} onMove={move}/></div>}
        {calendarView === "dayGridMonth" && !calendarLoading && (!calendarLoadError || hasLoadedCalendar) && <section className="mobile-upcoming-stage px-4 pb-5 xl:hidden" aria-labelledby="mobile-upcoming-title"><div className="rounded-[var(--radius)] border border-border bg-surface p-4"><div className="flex items-center justify-between gap-4"><h2 id="mobile-upcoming-title" className="text-lg font-semibold">Upcoming</h2><button type="button" onClick={() => { setView("lists"); setListSection("upcoming"); }} className="min-h-11 text-sm font-semibold text-primary">View all</button></div>{upcomingAppointments.length === 0 ? <p className="mt-3 rounded-lg bg-background p-4 text-sm text-muted">No upcoming appointments in this range.</p> : <div className="mt-2 divide-y divide-border">{upcomingAppointments.map((item) => { const categoryData=categories.find((value)=>value.id===item.category_id); const date=new Date(item.starts_at); return <button type="button" key={item.occurrence_id} onClick={() => startEdit(item)} className="grid min-h-14 w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left"><span aria-hidden="true" className="size-2 rounded-full" style={{backgroundColor:categoryData?.color ?? "#667168"}}/><span className="min-w-0"><span className="block truncate text-[1rem] font-semibold">{item.title}</span><span className="block text-xs text-muted">{categoryData?.name ?? "Other"}</span></span><span className="text-right text-xs text-muted"><span className="block">{date.toLocaleDateString([], { timeZone: timezone, month: "short", day: "numeric" })}</span><span className="block">{item.all_day ? "All day" : date.toLocaleTimeString([], { timeZone: timezone, hour: "numeric", minute: "2-digit" })}</span></span></button>;})}</div>}</div></section>}
      </>
      : <div className="p-3 lg:p-6"><div className="mb-4 flex gap-2 overflow-x-auto pb-2" role="tablist">{appointmentListSections.map((item) => <button key={item} role="tab" aria-selected={listSection === item} onClick={() => setListSection(item)} className={`shrink-0 rounded-full border px-4 ${listSection === item ? "bg-primary text-white" : "border-border"}`}>{item === "this-week" ? "This week" : `${item[0].toUpperCase()}${item.slice(1)}`}</button>)}</div><AppointmentListPanel section={listSection} kind="all" category={category} search={search} timezone={timezone} refreshKey={refreshKey} onOpen={(item) => void startEdit(item)}/></div>}
    </section>
    <aside className="hidden border-l border-border bg-surface p-6 xl:block"><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Upcoming</p><div className="mt-5 space-y-3">{appointments.slice(0, 8).map((item) => { const categoryName=categories.find((value)=>value.id===item.category_id)?.name ?? "Other"; return <button key={item.occurrence_id} onClick={() => startEdit(item)} className="w-full rounded-lg border border-border p-3 text-left"><strong>{item.title}{item.series_parent_id ? " ↻" : ""}</strong><span className="mt-1 block text-xs text-muted">{new Date(item.starts_at).toLocaleString([], { timeZone: timezone })} · {categoryName}</span></button>;})}</div></aside>
    <nav aria-label="Mobile navigation" className="safe-bottom mobile-safe-inline fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur xl:hidden"><button type="button" onClick={() => setView("calendar")} aria-current={view === "calendar" ? "page" : undefined} className={`mobile-nav-item ${view === "calendar" ? "text-primary" : ""}`}><CalendarDays aria-hidden="true"/>Calendar</button><button type="button" onClick={() => setView("lists")} aria-current={view === "lists" ? "page" : undefined} className={`mobile-nav-item ${view === "lists" ? "text-primary" : ""}`}><List aria-hidden="true"/>Lists</button><button type="button" onClick={() => startCreate()} className="mobile-nav-item"><span className="grid size-9 place-items-center rounded-full bg-primary text-white"><Plus size={21} aria-hidden="true"/></span>Create</button><Link href="/settings" className="mobile-nav-item"><Settings aria-hidden="true"/>Settings</Link></nav>

    {filterOpen && <div className="fixed inset-0 z-50 bg-black/40 xl:hidden" role="dialog" aria-modal="true" aria-label="Appointment filters"><div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Filters</h2><button onClick={() => setFilterOpen(false)} aria-label="Close filters"><X/></button></div>{filterControls}<button onClick={() => setFilterOpen(false)} className="mt-4 w-full rounded-lg bg-primary px-4 font-semibold text-white">Show results</button></div></div>}
    {undo && <div className="mobile-undo-offset safe-bottom fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-foreground px-4 py-3 text-background shadow-xl" role="status"><span>{undo.label}</span><button type="button" onClick={() => void undoLastAction()} className="rounded-md border border-background px-3">Undo</button></div>}

    {open && <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={editing ? "Edit appointment" : "Create appointment"}><form onSubmit={save} className="mx-auto max-w-2xl rounded-xl bg-surface p-5 shadow-xl sm:p-7">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">{editing ? "Appointment details" : "New appointment"}</h2>{editScope === "series" && <p className="text-sm text-muted">Editing the entire recurring series</p>}{editScope === "occurrence" && <p className="text-sm text-muted">Editing this occurrence only</p>}</div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X/></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">Title<input required maxLength={180} value={draft.title} onChange={(e) => setDraft({...draft,title:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
        <label className="sm:col-span-2">Category<select required value={draft.category_id} onChange={(e) => setDraft({...draft,category_id:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3">{categories.filter((item) => !item.hidden || item.id === draft.category_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={draft.all_day} onChange={(e) => setDraft({...draft,all_day:e.target.checked})}/>All-day appointment</label>
        <label>Start<input required type={draft.all_day ? "date" : "datetime-local"} value={draft.starts_at} onChange={(e) => { const start=e.target.value; if(endOverridden.current) return setDraft({...draft,starts_at:start}); const duration=localFieldMilliseconds(draft.ends_at)-localFieldMilliseconds(draft.starts_at); const end=draft.all_day ? start : shiftLocalField(start,Math.max(duration,3600000)); setDraft({...draft,starts_at:start,ends_at:end}); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
        <label>End<input required type={draft.all_day ? "date" : "datetime-local"} value={draft.ends_at} min={draft.starts_at} onChange={(e) => { endOverridden.current=true; setDraft({...draft,ends_at:e.target.value}); }} aria-describedby="event-range-error" className="mt-1 w-full rounded-lg border border-border bg-background px-3"/>{draft.ends_at < draft.starts_at && <span id="event-range-error" role="alert" className="mt-1 block text-sm text-red-700">End must not be earlier than Start.</span>}</label>
        <label>Location<input value={draft.location} onChange={(e) => setDraft({...draft,location:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
        {editScope !== "occurrence" && <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2"><legend className="px-1 font-semibold">Repeat</legend>
          <label>Repeats<select aria-label="Repeat pattern" value={draft.recurrence_frequency === "weekly" && draft.recurrence_interval > 1 ? "weekly-n" : draft.recurrence_frequency} onChange={(e) => {
            const value = e.target.value;
            setDraft({...draft, recurrence_frequency: value === "weekly-n" ? "weekly" : value as RecurrenceFrequency | "", recurrence_interval: value === "weekly-n" ? 2 : 1});
          }} className="mt-1 w-full rounded-lg border border-border bg-background px-3"><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="weekly-n">Every N weeks</option></select></label>
          {draft.recurrence_frequency === "weekly" && draft.recurrence_interval > 1 && <label>Week interval<input aria-label="Repeat every weeks" type="number" min="2" max="52" value={draft.recurrence_interval} onChange={(e) => setDraft({...draft,recurrence_interval:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>}
          {draft.recurrence_frequency && <><label>Ends<select aria-label="Repeat ending" value={draft.recurrence_until ? "date" : "never"} onChange={(e) => setDraft({...draft,recurrence_until:e.target.value === "date" ? draft.starts_at.slice(0,10) : ""})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"><option value="never">Never ends</option><option value="date">Ends on date</option></select></label>
          {draft.recurrence_until && <label>End date<input aria-label="Repeat end date" type="date" value={draft.recurrence_until} onChange={(e) => setDraft({...draft,recurrence_until:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>}
          <p className="text-sm text-muted sm:col-span-2">{recurrenceSummary({...editing, recurrence_frequency:draft.recurrence_frequency || null,recurrence_interval:draft.recurrence_interval,recurrence_until:draft.recurrence_until || null} as Appointment)}</p></>}
        </fieldset>}
        <fieldset className="min-w-0 rounded-lg border border-border p-3 sm:col-span-2"><legend className="px-1 font-semibold">Reminders</legend><div className="flex flex-wrap gap-4">{REMINDER_OPTIONS.map((option)=><label key={option.value} className="flex items-center gap-2"><input aria-label={option.value === 0 ? "Reminder when event begins" : `Reminder ${option.label.toLowerCase()}`} type="checkbox" checked={draft.reminder_minutes.includes(option.value)} onChange={(e)=>setDraft({...draft,reminder_minutes:normalizeReminderMinutes(e.target.checked?[...draft.reminder_minutes,option.value]:draft.reminder_minutes.filter((value)=>value!==option.value))})}/><span aria-hidden="true">{option.label}</span></label>)}</div><p className="mt-2 text-sm text-muted">Browser notifications are best effort and only used when permission has been granted.</p></fieldset>
        <label className="sm:col-span-2">Notes<textarea value={draft.public_notes} onChange={(e) => setDraft({...draft,public_notes:e.target.value})} className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-3"/></label>
        {editing && <fieldset className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2"><legend className="px-1 font-semibold">Public read-only sharing</legend>
          <p className="text-sm text-muted">{share ? "An active link exists for this appointment." : "No active sharing link."}</p>
          {!share && <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input aria-label="Show venue publicly" type="checkbox" checked={shareLocation} onChange={(e)=>setShareLocation(e.target.checked)}/><span aria-hidden="true">Show location</span></label><label className="flex items-center gap-2"><input type="checkbox" checked={shareNotes} onChange={(e)=>setShareNotes(e.target.checked)}/>Show public notes</label></div>}
          {shareUrl && <div><label className="sr-only" htmlFor="share-url">Public URL</label><input id="share-url" readOnly value={shareUrl} className="w-full rounded-lg border border-border bg-background px-3"/><button type="button" onClick={async()=>{await navigator.clipboard.writeText(shareUrl);setMessage("Link copied.");}} className="mt-2 rounded-lg border border-border px-3">Copy link</button></div>}
          <div className="flex gap-2">{!share && <button type="button" onClick={()=>void createShare()} className="rounded-lg border border-border px-3">Create sharing link</button>}{share && <><button type="button" onClick={()=>void revokeShare()} className="rounded-lg border border-red-700 px-3 text-red-700">Revoke link</button><button type="button" onClick={()=>void regenerateShare()} className="rounded-lg border border-border px-3">Regenerate</button></>}</div>
        </fieldset>}
      </div>
      {conflicts.length > 0 && !allowConflict && <div role="alert" className="mt-4 rounded-lg border border-amber-600 p-3"><strong>Time conflict</strong>{conflicts.map((item) => <p key={item.id} className="text-sm">{item.title}: {new Date(item.starts_at).toLocaleString()}–{new Date(item.ends_at).toLocaleTimeString()}</p>)}<button type="button" onClick={() => { setAllowConflict(true); void save(undefined, true); }} className="mt-2 rounded-lg border border-border px-3">Save anyway</button></div>}
      {message && <p role={stale ? "alert" : "status"} className="mt-4 text-sm">{message}</p>}
      {stale && <button type="button" onClick={() => void reloadLatest()} className="mt-2 rounded-lg border border-border px-3">Reload latest appointment</button>}
      <div className="mt-6 flex flex-wrap gap-2"><button disabled={pending} className="rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save appointment"}</button>
        {editing && <><button type="button" onClick={() => editing.archived ? void patch(editing,{archived:false}) : void undoablePatch(editing,{archived:true},undoAppointmentValues("archive",editing),"Appointment archived.")} className="flex items-center gap-1 rounded-lg border border-border px-3">{editing.archived?<RotateCcw size={17}/>:<Archive size={17}/>} {editing.archived?"Restore":"Archive"}</button><button type="button" onClick={() => remove(editing)} className="ml-auto flex items-center gap-1 rounded-lg border border-red-700 px-3 text-red-700"><Trash2 size={17}/>Delete permanently</button></>}
      </div>
    </form></div>}
  </main>;
}
