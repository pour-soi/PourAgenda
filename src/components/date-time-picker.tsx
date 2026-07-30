"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { TimeFormat } from "@/lib/date-format";
export type { TimeFormat } from "@/lib/date-format";

export const ENGLISH_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export const ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DateParts = { year: number; month: number; day: number };

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

export function parseEnglishDateTime(text: string, dateOnly: boolean, timeFormat: TimeFormat): string | null {
  const pattern = dateOnly
    ? /^(\d{2})\/(\d{2})\/(\d{4})$/
    : timeFormat === "12h"
      ? /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i
      : /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const parts = { month: Number(match[1]), day: Number(match[2]), year: Number(match[3]) };
  if (!parseDate(dateKey(parts))) return null;
  if (dateOnly) return dateKey(parts);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  if (minute > 59) return null;
  if (timeFormat === "12h") {
    if (hour < 1 || hour > 12) return null;
    const period = match[6].toUpperCase();
    hour = (hour % 12) + (period === "PM" ? 12 : 0);
  } else if (hour > 23) return null;
  return `${dateKey(parts)}T${twoDigits(hour)}:${twoDigits(minute)}`;
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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [visibleMonth, setVisibleMonth] = useState({ year: initial.year, month: initial.month });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
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

  const setDate = (day: number) => {
    const nextDate = dateKey({ ...visibleMonth, day });
    const suffix = value.includes("T") ? value.slice(10) : dateOnly ? "" : "T09:00";
    onChange(`${nextDate}${suffix}`);
  };
  const timeMatch = /T(\d{2}):(\d{2})/.exec(value);
  const hour24 = Number(timeMatch?.[1] ?? 9);
  const minute = Number(timeMatch?.[2] ?? 0);
  const setTime = (nextHour: number, nextMinute: number) => {
    const base = parseDate(value) ?? initial;
    onChange(`${dateKey(base)}T${twoDigits(nextHour)}:${twoDigits(nextMinute)}`);
  };
  const moveMonth = (amount: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month - 1 + amount, 1);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  const minimum = min?.slice(0, 10);
  const displayValue = formatEnglishDateTime(value, dateOnly, timeFormat);
  const commitTypedValue = (input: HTMLInputElement) => {
    const parsed = parseEnglishDateTime(input.value, dateOnly, timeFormat);
    if (!parsed) {
      setError(dateOnly
        ? "Enter a valid date as MM/DD/YYYY."
        : `Enter a valid date and time as ${timeFormat === "12h" ? "MM/DD/YYYY h:mm AM/PM" : "MM/DD/YYYY HH:mm"}.`);
      input.value = displayValue;
      return;
    }
    if (minimum && parsed.slice(0, 10) < minimum) {
      setError("Choose a date on or after the minimum date.");
      input.value = displayValue;
      return;
    }
    setError("");
    onChange(parsed);
  };

  return (
    <div ref={root} className="date-time-picker">
      <div className="date-time-picker-field">
        <input
          type="text"
          key={displayValue}
          defaultValue={displayValue}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-haspopup="dialog"
          aria-invalid={Boolean(error)}
          onClick={() => {
            if (!open && selected) setVisibleMonth({ year: selected.year, month: selected.month });
            setOpen((current) => !current);
          }}
          onBlur={(event) => commitTypedValue(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTypedValue(event.currentTarget);
            }
          }}
        />
        <CalendarDays aria-hidden="true" size={18} />
      </div>
      {error && <span className="date-time-picker-error" role="alert">{error}</span>}
      {open && (
        <div className="date-time-picker-popover" role="dialog" aria-label={`${ariaLabel} picker`}>
          <div className="date-time-picker-month">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft aria-hidden="true" /></button>
            <strong>{ENGLISH_MONTHS[visibleMonth.month - 1]} {visibleMonth.year}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight aria-hidden="true" /></button>
          </div>
          <div className="date-time-picker-calendar" aria-label="Calendar, Sunday first">
            {ENGLISH_WEEKDAYS.map((weekday) => <span key={weekday} className="date-time-picker-weekday">{weekday}</span>)}
            {days.map((day, index) => day === null
              ? <span key={`blank-${index}`} />
              : (
                <button
                  type="button"
                  key={day}
                  disabled={Boolean(minimum && dateKey({ ...visibleMonth, day }) < minimum)}
                  aria-pressed={selected?.year === visibleMonth.year && selected.month === visibleMonth.month && selected.day === day}
                  onClick={() => setDate(day)}
                >
                  {day}
                </button>
              ))}
          </div>
          {!dateOnly && (
            <fieldset className="date-time-picker-time">
              <legend>Time</legend>
              {timeFormat === "12h" ? (
                <>
                  <label><span>Hour</span><select value={hour24 % 12 || 12} onChange={(event) => {
                    const hour12 = Number(event.target.value);
                    setTime((hour24 >= 12 ? 12 : 0) + (hour12 % 12), minute);
                  }}>{Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour}>{hour}</option>)}</select></label>
                  <label><span>Minute</span><select value={minute} onChange={(event) => setTime(hour24, Number(event.target.value))}>{Array.from({ length: 60 }, (_, index) => <option key={index} value={index}>{twoDigits(index)}</option>)}</select></label>
                  <label><span>Period</span><select value={hour24 < 12 ? "AM" : "PM"} onChange={(event) => setTime((hour24 % 12) + (event.target.value === "PM" ? 12 : 0), minute)}><option>AM</option><option>PM</option></select></label>
                </>
              ) : (
                <>
                  <label><span>Hour</span><select value={hour24} onChange={(event) => setTime(Number(event.target.value), minute)}>{Array.from({ length: 24 }, (_, index) => <option key={index} value={index}>{twoDigits(index)}</option>)}</select></label>
                  <label><span>Minute</span><select value={minute} onChange={(event) => setTime(hour24, Number(event.target.value))}>{Array.from({ length: 60 }, (_, index) => <option key={index} value={index}>{twoDigits(index)}</option>)}</select></label>
                </>
              )}
            </fieldset>
          )}
          <button type="button" className="date-time-picker-done" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}
