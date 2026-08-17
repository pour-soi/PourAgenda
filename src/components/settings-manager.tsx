"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { categoryInput, friendlyDataError, settingsInput } from "@/lib/phase1";
import { REMINDER_OPTIONS, normalizeReminderMinutes } from "@/lib/reminders";
import { csv, downloadText } from "@/lib/export";
import { appointmentsToIcs } from "@/lib/ics";
import type { Appointment } from "@/types/domain";

type SettingsRow = {
  timezone: string;
  automatic_timezone: boolean;
  default_duration_minutes: number;
  week_starts_on: number;
  date_format: string;
  time_format: string;
  theme: string;
  default_reminder_minutes: number[];
};
type Category = { id: string; name: string; color: string; hidden: boolean };
type CategoryReplacement = {
  category: Category;
  appointmentCount: number;
  replacementCategoryId: string;
};
const TIMEZONES = [
  ["Pacific Time", "America/Los_Angeles"],
  ["Mountain Time", "America/Denver"],
  ["Central Time", "America/Chicago"],
  ["Eastern Time", "America/New_York"],
  ["China Standard Time", "Asia/Shanghai"],
  ["Japan Standard Time", "Asia/Tokyo"],
  ["United Kingdom", "Europe/London"],
] as const;
const timezoneLabel = (value: string) => {
  const match = TIMEZONES.find(([, zone]) => zone === value);
  return match ? `${match[0]} (${match[1]})` : value.replaceAll("_", " ") + ` (${value})`;
};
const applicationServerKey = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
  return bytes;
};

export function SettingsManager({
  userId,
  email,
  initialName,
  initialSettings,
  initialCategories,
}: {
  userId: string;
  email: string;
  initialName: string;
  initialSettings: SettingsRow;
  initialCategories: Category[];
}) {
  const [name, setName] = useState(initialName);
  const [settings, setSettings] = useState({
    ...initialSettings,
    time_format: ["locale", "12h", "24h"].includes(initialSettings.time_format)
      ? initialSettings.time_format
      : "locale",
  });
  const [categories, setCategories] = useState(initialCategories);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "default" | "blocked" | "enabled">(() => {
    if (typeof window === "undefined") return "default";
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    return Notification.permission === "denied" ? "blocked" : "default";
  });
  const [categoryReplacement, setCategoryReplacement] = useState<CategoryReplacement | null>(null);
  const moveDeleteInProgress = useRef(false);
  const persistedCategories = useRef(new Map(initialCategories.map((category) => [category.id, category])));
  const supabase = createClient();
  useEffect(() => {
    const detect = () => setSettings((current) => {
      if (!current.automatic_timezone) return current;
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return detected && detected !== current.timezone ? { ...current, timezone: detected } : current;
    });
    detect();
    document.addEventListener("visibilitychange", detect);
    window.addEventListener("focus", detect);
    return () => {
      document.removeEventListener("visibilitychange", detect);
      window.removeEventListener("focus", detect);
    };
  }, []);
  useEffect(() => {
    if (pushState !== "unsupported" && Notification.permission === "granted") {
      void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setPushState(subscription ? "enabled" : "default"));
    }
  }, [pushState]);

  async function enablePersonalAppointmentPush() {
    if (pushState === "unsupported") return setMessage("This browser does not support Web Push.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState(permission === "denied" ? "blocked" : "default");
      setMessage(permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission was not granted.");
      return;
    }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/push/vapid-key", { cache: "no-store" });
      if (!response.ok) throw new Error("Push is not configured.");
      const { publicKey } = await response.json() as { publicKey: string };
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The browser returned an incomplete push subscription.");
      const result = await supabase.from("push_subscriptions").upsert({
        user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, disabled_at: null,
      }, { onConflict: "user_id,endpoint" });
      if (result.error) throw result.error;
      setPushState("enabled");
      setMessage("Personal appointment notifications enabled.");
    } catch {
      setMessage("Personal appointment notifications could not be enabled.");
    } finally {
      setPending(false);
    }
  }

  async function exportData(kind: "appointments" | "contacts" | "settings") {
    setPending(true); setMessage("");
    if (kind === "settings") {
      const [settingsResult, categoriesResult] = await Promise.all([
        supabase.from("user_settings").select("*").eq("user_id", userId).single(),
        supabase.from("categories").select("name,color,hidden,created_at,updated_at").eq("user_id", userId).order("name"),
      ]);
      setPending(false);
      if (settingsResult.error || categoriesResult.error) return setMessage("Your settings export could not be created.");
      downloadText("pouragenda-settings.json", JSON.stringify({ settings: settingsResult.data, categories: categoriesResult.data }, null, 2), "application/json");
    } else {
      const table = kind === "contacts" ? "contacts" : "appointments";
      const collected: Record<string, unknown>[] = [];
      for (let start = 0; ; start += 500) {
        const result = await supabase.from(table).select("*").eq("user_id", userId).order("created_at").range(start, start + 499);
        if (result.error) { setPending(false); return setMessage("Your export could not be created."); }
        collected.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) break;
      }
      setPending(false);
      const safe = collected.map((row) => Object.fromEntries(Object.entries(row)
        .filter(([key]) => key !== "user_id" && key !== "archived")));
      downloadText(`pouragenda-${kind}.csv`, csv(safe), "text/csv;charset=utf-8");
    }
    await supabase.from("appointment_activity").insert({ user_id: userId, appointment_id: null, action: "export_requested" });
    setMessage("Export created.");
  }

  async function deleteAccount() {
    const password = window.prompt("Enter your current password to permanently delete your account:");
    if (!password) return;
    if (!window.confirm("Permanently delete your account and all PourAgenda data? This cannot be undone.")) return;
    setPending(true);
    const login = await supabase.auth.signInWithPassword({ email, password });
    if (login.error) { setPending(false); return setMessage("Password confirmation failed. Your account was not deleted."); }
    await supabase.from("appointment_activity").insert({ user_id: userId, appointment_id: null, action: "account_deletion_requested" });
    const result = await supabase.rpc("delete_own_account");
    setPending(false);
    if (result.error) return setMessage("Account deletion did not complete. No success was reported.");
    window.location.assign("/login");
  }

  async function exportCalendar() {
    setPending(true);
    const rows: Appointment[] = [];
    for (let start = 0; ; start += 500) {
      const result = await supabase.from("appointments").select("*").eq("user_id", userId).order("created_at").range(start, start + 499);
      if (result.error) { setPending(false); return setMessage("Your calendar export could not be created."); }
      rows.push(...(result.data as Appointment[]));
      if ((result.data?.length ?? 0) < 500) break;
    }
    setPending(false);
    downloadText("pouragenda-calendar.ics", appointmentsToIcs(rows), "text/calendar;charset=utf-8");
    await supabase.from("appointment_activity").insert({ user_id: userId, appointment_id: null, action: "export_requested" });
    setMessage("Calendar export created.");
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const parsed = settingsInput.safeParse(settings);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check your settings.");
      return;
    }
    setPending(true);
    setMessage("");
    const profileResult = await supabase.from("profiles").update({ display_name: name.trim() || null }).eq("user_id", userId);
    let settingsResult = await supabase.from("user_settings").update(parsed.data).eq("user_id", userId);
    let migrationPending = false;
    if (settingsResult.error?.code === "PGRST204" && settingsResult.error.message.includes("automatic_timezone")) {
      const { automatic_timezone: _automatic, ...legacySettings } = parsed.data;
      void _automatic;
      settingsResult = await supabase.from("user_settings").update(legacySettings).eq("user_id", userId);
      migrationPending = !settingsResult.error;
    }
    setPending(false);
    const error = profileResult.error ?? settingsResult.error;
    if (!error) await supabase.from("appointment_activity").insert({ user_id: userId, appointment_id: null, action: "reminder_changed" });
    setMessage(error ? friendlyDataError(error) : migrationPending
      ? "Settings saved. Apply the latest database migration to sync automatic detection across devices."
      : "Settings saved.");
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const categoryName = String(form.get("name") ?? "").trim();
    const color = String(form.get("color") ?? "#667168");
    const parsed = categoryInput.safeParse({ name: categoryName, color, hidden: false });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check the category.");
      return;
    }
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, ...parsed.data })
      .select("id,name,color,hidden")
      .single();
    if (error) setMessage(friendlyDataError(error));
    else {
      setCategories((current) => [...current, data]);
      event.currentTarget.reset();
      setMessage("Category created.");
    }
  }

  async function updateCategory(category: Category) {
    const parsed = categoryInput.safeParse(category);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check the category.");
      return;
    }
    setPending(true);
    const { data, error } = await supabase
      .from("categories")
      .update(parsed.data)
      .eq("id", category.id)
      .eq("user_id", userId)
      .select("id,name,color,hidden")
      .single();
    setPending(false);
    if (error || !data) {
      const persisted = persistedCategories.current.get(category.id);
      if (persisted) setCategories((current) => current.map((item) => item.id === category.id ? persisted : item));
      setMessage(error ? friendlyDataError(error) : "That category could not be found.");
      return;
    }
    persistedCategories.current.set(data.id, data);
    setCategories((current) => current.map((item) => item.id === data.id ? data : item));
    setMessage("Category updated.");
  }

  async function removeCategory(category: Category, replacementCategoryId: string | null = null): Promise<boolean> {
    if (replacementCategoryId) {
      const moveAndDeleteResult = await supabase.rpc("move_category_appointments_and_delete", {
        source_category_id: category.id,
        replacement_category_id: replacementCategoryId,
      });
      if (moveAndDeleteResult.error) {
        setMessage(friendlyDataError(moveAndDeleteResult.error));
        return false;
      }

      setCategories((current) => current.filter((item) => item.id !== category.id));
      setMessage("Category deleted.");
      setCategoryReplacement(null);
      return true;
    }

    setPending(true);
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id)
      .eq("user_id", userId);
    setPending(false);
    if (error) {
      setMessage(friendlyDataError(error));
      return false;
    }

    setCategories((current) => current.filter((item) => item.id !== category.id));
    setMessage("Category deleted.");
    setCategoryReplacement(null);
    return true;
  }

  async function deleteCategory(category: Category) {
    setMessage("");
    const usedResult = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("category_id", category.id);
    if (usedResult.error) return setMessage(friendlyDataError(usedResult.error));

    const appointmentCount = usedResult.count ?? 0;
    if (appointmentCount === 0) return removeCategory(category);

    const replacementCategories = categories.filter((item) => item.id !== category.id);
    if (!replacementCategories.length) {
      setMessage("Create another category before deleting this one.");
      return;
    }

    setCategoryReplacement({
      category,
      appointmentCount,
      replacementCategoryId: replacementCategories[0].id,
    });
  }

  async function confirmMoveAndDelete() {
    if (pending || !categoryReplacement || moveDeleteInProgress.current) return;
    moveDeleteInProgress.current = true;
    setPending(true);
    try {
      const result = await removeCategory(categoryReplacement.category, categoryReplacement.replacementCategoryId);
      if (!result) return;
    } finally {
      setPending(false);
      moveDeleteInProgress.current = false;
    }
  }

  function handleReplaceCategory(categoryId: string) {
    setCategoryReplacement((current) => current ? { ...current, replacementCategoryId: categoryId } : null);
  }

  function cancelReplaceCategory() {
    setCategoryReplacement(null);
    setMessage("");
  }

  const replacementCategoryOptions = categoryReplacement
    ? categories.filter((item) => item.id !== categoryReplacement.category.id)
    : [];

  return <main className="min-h-dvh bg-background p-4 sm:p-8">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft size={18} />Calendar</Link>
      <h1 className="mt-5 text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-muted">Manage your profile, scheduling defaults, and categories.</p>
      {message && <p role="status" className="mt-5 rounded-lg border border-border bg-surface p-3 text-sm">{message}</p>}

      <form onSubmit={saveSettings} className="mt-8 space-y-5 rounded-[var(--radius)] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Profile and preferences</h2>
        <label className="block text-sm font-medium">Display name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-2 w-full rounded-lg border border-border bg-background px-3" />
        </label>
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 font-semibold">Time zone</legend>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={settings.automatic_timezone} onChange={(event) => setSettings({ ...settings, automatic_timezone: event.target.checked })}/>Automatically detect time zone</label>
          <p className="mt-2 text-sm text-muted">Current time zone: <strong className="text-foreground">{timezoneLabel(settings.timezone)}</strong></p>
          {!settings.automatic_timezone && <label className="mt-4 block text-sm font-medium">Search by city or time zone
            <input list="pouragenda-timezones" value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} required aria-describedby="timezone-help" className="mt-2 w-full rounded-lg border border-border bg-background px-3"/>
            <datalist id="pouragenda-timezones">{TIMEZONES.map(([label, zone]) => <option key={zone} value={zone}>{label}</option>)}</datalist>
            <span id="timezone-help" className="mt-1 block text-xs text-muted">Choose a suggestion or enter a valid city-based time zone.</span>
          </label>}
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium">Default duration
            <select value={settings.default_duration_minutes} onChange={(event) => setSettings({ ...settings, default_duration_minutes: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-border bg-background px-3">
              {[15, 30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} minutes</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Week starts on
            <select value={settings.week_starts_on} onChange={(event) => setSettings({ ...settings, week_starts_on: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-border bg-background px-3">
              <option value={0}>Sunday</option><option value={1}>Monday</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Time format
            <select value={settings.time_format} onChange={(event) => setSettings({ ...settings, time_format: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background px-3">
              <option value="locale">Follow system</option><option value="12h">12-hour</option><option value="24h">24-hour</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Theme
            <select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background px-3">
              <option value="system">Follow system</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 font-semibold">Default reminders</legend>
          <p className="mb-3 text-sm text-muted">Best effort while PourAgenda is open. iPhone notifications require an installed PWA and are not guaranteed in the background.</p>
          <div className="flex flex-wrap gap-4">{REMINDER_OPTIONS.map((option) => <label key={option.value} className="flex items-center gap-2"><input type="checkbox" checked={settings.default_reminder_minutes.includes(option.value)} onChange={(event) => setSettings({...settings,default_reminder_minutes:normalizeReminderMinutes(event.target.checked ? [...settings.default_reminder_minutes,option.value] : settings.default_reminder_minutes.filter((value)=>value!==option.value))})}/>{option.label}</label>)}</div>
        </fieldset>
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 font-semibold">Personal appointment reminders</legend>
          <p className="mb-3 text-sm text-muted">Installed PWAs can receive reminders at noon, 5 PM, and 9 PM on each of the three days before appointments in the Personal Appointment category.</p>
          <button type="button" disabled={pending || pushState === "blocked" || pushState === "unsupported" || pushState === "enabled"}
            onClick={() => void enablePersonalAppointmentPush()} className="rounded-lg border border-border px-3">
            {pushState === "enabled" ? "Notifications enabled" : pushState === "blocked" ? "Notifications blocked" : pushState === "unsupported" ? "Notifications unavailable" : "Enable notifications"}
          </button>
        </fieldset>
        <button disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60"><Save size={18} />{pending ? "Saving…" : "Save settings"}</button>
      </form>

      <section className="mt-8 rounded-[var(--radius)] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Account and privacy</h2>
        <p className="mt-2 text-sm text-muted">Exports contain only data accessible to your signed-in account.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={pending} onClick={()=>void exportData("appointments")} className="rounded-lg border border-border px-3">Export appointments CSV</button><button disabled={pending} onClick={()=>void exportCalendar()} className="rounded-lg border border-border px-3">Export calendar ICS</button><button disabled={pending} onClick={()=>void exportData("contacts")} className="rounded-lg border border-border px-3">Export contacts CSV</button><button disabled={pending} onClick={()=>void exportData("settings")} className="rounded-lg border border-border px-3">Export settings JSON</button><Link href="/forgot-password" className="rounded-lg border border-border px-3 py-2">Change password</Link></div>
        <div className="mt-6 border-t border-red-300 pt-5"><h3 className="font-semibold text-red-700">Delete account</h3><p className="mt-1 text-sm">Permanently deletes your account, appointments, contacts, recurrence data, and public links.</p><button disabled={pending} onClick={()=>void deleteAccount()} className="mt-3 rounded-lg border border-red-700 px-3 text-red-700">Delete account permanently</button></div>
      </section>

      <section className="mt-8 rounded-[var(--radius)] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Categories</h2>
        <form onSubmit={addCategory} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="sr-only" htmlFor="category-name">Category name</label>
          <input id="category-name" name="name" required maxLength={80} placeholder="New category name" className="rounded-lg border border-border bg-background px-3" />
          <input name="color" type="color" defaultValue="#667168" aria-label="Category color" className="w-full rounded-lg border border-border bg-background p-1 sm:w-14" />
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white"><Plus size={18} />Add</button>
        </form>
        <div className="mt-6 space-y-3">
          {categories.map((category, index) => <div key={category.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
            <input aria-label={`Name for ${category.name}`} value={category.name} onChange={(event) => setCategories((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="rounded-lg border border-border bg-background px-3" />
            <input type="color" aria-label={`Color for ${category.name}`} value={category.color} onChange={(event) => setCategories((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))} className="w-full rounded-lg border border-border bg-background p-1 sm:w-14" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={category.hidden} onChange={(event) => setCategories((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hidden: event.target.checked } : item))} />Hidden</label>
            <div className="flex gap-2">
              <button onClick={() => updateCategory(category)} type="button" className="rounded-lg border border-border px-3" aria-label={`Save ${category.name}`}><Save size={17} /></button>
              <button onClick={() => deleteCategory(category)} type="button" className="rounded-lg border border-border px-3 text-red-700" aria-label={`Delete ${category.name}`}><Trash2 size={17} /></button>
            </div>
          </div>)}
        </div>
      </section>
      {categoryReplacement ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={`Delete category ${'"'}${categoryReplacement.category.name}${'"'}`}>
        <div className="mx-auto mt-10 max-w-lg rounded-xl bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Delete category {`"`}{categoryReplacement.category.name}{`"`}</h2>
          <p className="mt-2 text-sm text-muted">This category is currently used by {categoryReplacement.appointmentCount} appointments.</p>
          <label className="mt-4 block text-sm font-medium">Choose a replacement category:
            <select value={categoryReplacement.replacementCategoryId} onChange={(event) => handleReplaceCategory(event.target.value)}
              disabled={pending} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2">
              {replacementCategoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={cancelReplaceCategory} disabled={pending} className="rounded-lg border border-border px-3">Cancel</button>
            <button type="button" onClick={() => void confirmMoveAndDelete()} disabled={pending} className="rounded-lg bg-primary px-3 font-semibold text-white">Move & Delete</button>
          </div>
        </div>
      </div> : null}
    </div>
  </main>;
}
