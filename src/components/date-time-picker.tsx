"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import type { TimeFormat } from "@/lib/date-format";
export type { TimeFormat } from "@/lib/date-format";

export const ENGLISH_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export const ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DateParts = { year: number; month: number; day: number };
type PickerKind = "date" | "time";

function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return date.getFullYear() === parts.year && date.getMonth() === parts.month - 1 && date.getDate() === parts.day
    ? parts
    : null;
}

const twoDigits = (value: number) => String(value).padStart(2, "0");
const dateKey = ({ year, month, day }: DateParts) => `${year}-${twoDigits(month)}-${twoDigits(day)}`;

function PeriodControl({ value, onChange }: { value: "AM" | "PM"; onChange: (value: "AM" | "PM") => void }) {
  return <div className="time-period-control" data-period={value}><span>AM/PM</span><div role="group" aria-label="AM/PM">
    <span className="time-period-indicator" aria-hidden="true" />
    {(["AM", "PM"] as const).map((period) => <button key={period} type="button" aria-pressed={value === period} onClick={() => onChange(period)}>{period}</button>)}
  </div></div>;
}

export function formatEnglishDate(value: string): string {
  const parts = parseDate(value);
  return parts ? `${twoDigits(parts.month)}/${twoDigits(parts.day)}/${parts.year}` : "";
}

export function formatEnglishTime(value: string, timeFormat: TimeFormat): string {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2];
  if (timeFormat === "24h") return `${twoDigits(hour)}:${minute}`;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatEnglishDateTime(value: string, dateOnly: boolean, timeFormat: TimeFormat): string {
  const date = formatEnglishDate(value);
  if (!date || dateOnly) return date;
  const time = formatEnglishTime(value, timeFormat);
  return time ? `${date} ${time}` : date;
}

export function EnglishDateTimePicker({
  value,
  onChange,
  ariaLabel,
  dateOnly = false,
  timeFormat = "12h",
  min,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  dateOnly?: boolean;
  timeFormat?: TimeFormat;
  min?: string;
  describedBy?: string;
}) {
  const selected = parseDate(value);
  const initial = selected ?? (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  const [open, setOpen] = useState<PickerKind | null>(null);
  const [visibleMonth, setVisibleMonth] = useState({ year: initial.year, month: initial.month });
  const root = useRef<HTMLDivElement>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const timeTrigger = useRef<HTMLButtonElement>(null);
  const controlName = ariaLabel.toLowerCase();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        (open === "date" ? dateTrigger : timeTrigger).current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const days = useMemo(() => {
    const firstWeekday = new Date(visibleMonth.year, visibleMonth.month - 1, 1).getDay();
    const count = new Date(visibleMonth.year, visibleMonth.month, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [visibleMonth]);

  const timeMatch = /T(\d{2}):(\d{2})/.exec(value);
  const hour24 = Number(timeMatch?.[1] ?? 9);
  const minute = Number(timeMatch?.[2] ?? 0);
  const minimum = min?.slice(0, 10);
  const setDate = (day: number) => {
    const nextDate = dateKey({ ...visibleMonth, day });
    const suffix = value.includes("T") ? value.slice(10) : dateOnly ? "" : "T09:00";
    onChange(`${nextDate}${suffix}`);
  };
  const setTime = (nextHour: number, nextMinute: number) => {
    onChange(`${dateKey(parseDate(value) ?? initial)}T${twoDigits(nextHour)}:${twoDigits(nextMinute)}`);
  };
  const moveMonth = (amount: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month - 1 + amount, 1);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  const openPicker = (kind: PickerKind) => {
    if (kind === "date" && selected) setVisibleMonth({ year: selected.year, month: selected.month });
    setOpen((current) => current === kind ? null : kind);
  };
  const closePicker = (kind: PickerKind) => {
    setOpen(null);
    (kind === "date" ? dateTrigger : timeTrigger).current?.focus();
  };

  return (
    <div ref={root} className="date-time-picker">
      <input className="sr-only" tabIndex={-1} readOnly aria-label={ariaLabel} value={formatEnglishDateTime(value, dateOnly, timeFormat)} />
      <div className="date-time-picker-controls" data-date-only={dateOnly || undefined}>
        <div className="date-time-picker-control">
          <span>Date</span>
          <button ref={dateTrigger} type="button" aria-label={`Choose ${controlName} date`} aria-haspopup="dialog" aria-expanded={open === "date"} aria-describedby={describedBy} onClick={() => openPicker("date")}>
            <span>{formatEnglishDate(value)}</span><CalendarDays aria-hidden="true" size={18} />
          </button>
        </div>
        {!dateOnly && <div className="date-time-picker-control">
          <span>Time</span>
          <button ref={timeTrigger} type="button" aria-label={`Choose ${controlName} time`} aria-haspopup="dialog" aria-expanded={open === "time"} aria-describedby={describedBy} onClick={() => openPicker("time")}>
            <span>{formatEnglishTime(value, timeFormat)}</span><Clock3 aria-hidden="true" size={18} />
          </button>
        </div>}
      </div>

      {open === "date" && <div className="date-time-picker-popover" role="dialog" aria-label={`${ariaLabel} date picker`}>
        <div className="date-time-picker-month">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft aria-hidden="true" /></button>
          <strong>{ENGLISH_MONTHS[visibleMonth.month - 1]} {visibleMonth.year}</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="date-time-picker-calendar" aria-label="Calendar, Sunday first">
          {ENGLISH_WEEKDAYS.map((weekday) => <span key={weekday} className="date-time-picker-weekday">{weekday}</span>)}
          {days.map((day, index) => day === null ? <span key={`blank-${index}`} /> : <button type="button" key={day} disabled={Boolean(minimum && dateKey({ ...visibleMonth, day }) < minimum)} aria-pressed={selected?.year === visibleMonth.year && selected.month === visibleMonth.month && selected.day === day} onClick={() => setDate(day)}>{day}</button>)}
        </div>
        <button type="button" className="date-time-picker-done" onClick={() => closePicker("date")}>Done</button>
      </div>}

      {open === "time" && !dateOnly && <div className="date-time-picker-popover time-picker-popover" role="dialog" aria-label={`${ariaLabel} time picker`}>
        <fieldset className="date-time-picker-time" data-time-format={timeFormat}>
          <legend>Choose time</legend>
          <label>Hour<select aria-label={`${ariaLabel} hour`} value={timeFormat === "12h" ? hour24 % 12 || 12 : hour24} onChange={(event) => {
            const next = Number(event.target.value);
            setTime(timeFormat === "12h" ? (hour24 >= 12 ? 12 : 0) + (next % 12) : next, minute);
          }}>{Array.from({ length: timeFormat === "12h" ? 12 : 24 }, (_, index) => timeFormat === "12h" ? index + 1 : index).map((hour) => <option key={hour} value={hour}>{twoDigits(hour)}</option>)}</select></label>
          <label>Minute<select aria-label={`${ariaLabel} minute`} value={minute} onChange={(event) => setTime(hour24, Number(event.target.value))}>{Array.from({ length: 60 }, (_, value) => <option key={value} value={value}>{twoDigits(value)}</option>)}</select></label>
          {timeFormat === "12h" && <PeriodControl value={hour24 < 12 ? "AM" : "PM"} onChange={(period) => setTime((hour24 % 12) + (period === "PM" ? 12 : 0), minute)} />}
        </fieldset>
        <button type="button" className="date-time-picker-done" onClick={() => closePicker("time")}>Done</button>
      </div>}
    </div>
  );
}
