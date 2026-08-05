"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { EnglishDateTimePicker } from "@/components/date-time-picker";
import { formatDate } from "@/lib/date-format";
import { recurrencePreviewWithExceptions, recurrenceSummary, type RecurrencePreviewItem } from "@/lib/recurrence";
import type { Appointment, RecurrenceFrequency } from "@/types/domain";

export function RecurrenceEditor({ appointment, exceptions, frequency, interval, until, timezone, persisted,
  onFrequency, onInterval, onUntil, onSkip, onRestore, onEdit, onMove }: {
  appointment: Appointment; exceptions: Appointment[]; frequency: RecurrenceFrequency | ""; interval: number;
  until: string; timezone: string; persisted: boolean;
  onFrequency: (value: RecurrenceFrequency | "", interval: number) => void;
  onInterval: (value: number) => void; onUntil: (value: string) => void;
  onSkip: (item: RecurrencePreviewItem) => void | Promise<void>; onRestore: (item: RecurrencePreviewItem) => void | Promise<void>;
  onEdit: (item: RecurrencePreviewItem) => void | Promise<void>; onMove: (item: RecurrencePreviewItem) => void | Promise<void>;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${appointment.intended_local_start?.slice(0, 10) ?? appointment.starts_at.slice(0, 10)}T12:00:00Z`));
  const preview = frequency ? recurrencePreviewWithExceptions(appointment, exceptions, 5) : [];
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && menuRef.current?.contains(event.target as Node)) return;
      const id = menu; setMenu(null); requestAnimationFrame(() => triggers.current.get(id)?.focus());
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);
  const act = async (item: RecurrencePreviewItem, action: (item: RecurrencePreviewItem) => void | Promise<void>) => {
    const id = item.occurrence.occurrence_id;
    setMenu(null);
    try { await action(item); }
    finally { requestAnimationFrame(() => triggers.current.get(id)?.focus()); }
  };
  const navigateMenu = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]'));
    if (!items.length) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  };
  return <fieldset className="sm:col-span-2 rounded-xl bg-background/70 p-4">
    <legend className="px-1 text-base font-semibold">Repeat</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Frequency<select aria-label="Repeat pattern" value={frequency === "weekly" && interval > 1 ? "weekly-n" : frequency} onChange={(event) => {
        const value = event.target.value; onFrequency(value === "weekly-n" ? "weekly" : value as RecurrenceFrequency | "", value === "weekly-n" ? 2 : 1);
      }} className="mt-1 w-full rounded-lg border border-border bg-surface px-3"><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="weekly-n">Every N weeks</option></select></label>
      {frequency === "weekly" && <div><span className="text-sm font-medium">Repeat on</span><button type="button" aria-label={`Repeat on ${weekday}, derived from Start`} aria-disabled="true" className="mt-1 flex min-h-11 w-full items-center rounded-lg border border-border bg-surface px-3 text-left">{weekday}</button><p className="mt-1 text-xs text-muted">Determined by the Start date.</p></div>}
      {frequency === "weekly" && interval > 1 && <label className="text-sm font-medium">Interval<select aria-label="Repeat every weeks" value={interval} onChange={(event) => onInterval(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-surface px-3">{Array.from({length:52},(_,index)=>index+1).map((value)=><option key={value} value={value}>Every {value} weeks</option>)}</select></label>}
      {frequency && <label className="grid min-w-0 text-sm font-medium" data-recurrence-control="ends">Ends<select aria-label="Repeat ending" value={until ? "date" : "never"} onChange={(event) => onUntil(event.target.value === "date" ? appointment.intended_local_start?.slice(0,10) ?? appointment.starts_at.slice(0,10) : "")} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3"><option value="never">Never</option><option value="date">On a date</option></select></label>}
      {frequency && until && <div className="grid min-w-0 text-sm font-medium" data-recurrence-control="end-date"><span>End Date</span><EnglishDateTimePicker ariaLabel="Repeat end date" dateButtonAriaLabel="Choose repeat end date" value={until} dateOnly showDateLabel={false} min={appointment.intended_local_start ?? appointment.starts_at} onChange={(value) => onUntil(value.slice(0,10))}/></div>}
    </div>
    {frequency && <div className="mt-4 border-t border-border/70 pt-4" aria-live="polite"><h3 className="text-sm font-semibold">Summary</h3><p className="mt-1 font-medium">{recurrenceSummary(appointment).replace(/^Repeats /, "").replace(/ until .*| and never ends\.$/, "")}</p><p className="text-sm text-muted">{until ? `Until ${formatDate(`${until}T12:00:00Z`, "UTC")}` : "No end date"}</p>
      <h3 className="mt-4 text-sm font-semibold">Upcoming</h3><div className="mt-1 divide-y divide-border/70" role="list">{preview.map((item) => {
        const id=item.occurrence.occurrence_id; const displayTimezone=item.occurrence.all_day?"UTC":timezone; const label=formatDate(item.occurrence.starts_at,displayTimezone);
        const actionDate=new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:displayTimezone}).format(new Date(item.occurrence.starts_at));
        return <div key={id} role="listitem" data-occurrence-state={item.state} data-original-occurrence-start={item.originalStartsAt} className="relative flex min-h-12 items-center justify-between gap-3 py-2"><div><span className={item.state === "skipped" ? "text-muted line-through" : "font-medium"}>{item.state === "moved" ? `${formatDate(item.originalStartsAt, timezone)} → ${label}` : label}</span>{item.state !== "normal" && <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted" role="status">{item.state}</span>}</div>{persisted && <button ref={(node)=>{if(node)triggers.current.set(id,node);else triggers.current.delete(id);}} type="button" aria-label={`Actions for ${actionDate}`} aria-haspopup="menu" aria-expanded={menu===id} onClick={()=>setMenu(menu===id?null:id)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"><MoreHorizontal aria-hidden="true"/></button>}{menu===id && <div ref={menuRef} role="menu" onKeyDown={navigateMenu} className="absolute right-0 top-11 z-20 min-w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-1 shadow-xl">{item.state === "skipped" ? <button role="menuitem" type="button" onClick={()=>void act(item,onRestore)} className="min-h-11 w-full rounded-md px-3 text-left hover:bg-background">Restore occurrence</button> : <><button role="menuitem" type="button" onClick={()=>void act(item,onSkip)} className="min-h-11 w-full rounded-md px-3 text-left hover:bg-background">Skip this occurrence</button><button role="menuitem" type="button" onClick={()=>void act(item,onEdit)} className="min-h-11 w-full rounded-md px-3 text-left hover:bg-background">Edit only this occurrence</button><button role="menuitem" type="button" onClick={()=>void act(item,onMove)} className="min-h-11 w-full rounded-md px-3 text-left hover:bg-background">Move this occurrence</button></>}</div>}</div>})}</div>{!persisted && <p className="mt-2 text-xs text-muted">Save the series before managing individual occurrences.</p>}</div>}
  </fieldset>;
}
