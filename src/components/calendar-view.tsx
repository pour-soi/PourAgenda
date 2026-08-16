"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DayExperience } from "@/components/day-experience";
import { localInputToUtc, toLocalInput } from "@/lib/appointments";
import { dayKind, zonedDateKey } from "@/lib/personal-productivity";
import { formatTime, fullCalendarTimeDisplayOptions, type TimeFormat } from "@/lib/date-format";
import type { CalendarEvent } from "@/lib/calendar-events";

declare global {
  interface Window {
    __pourAgendaCalendar?: ReturnType<FullCalendar["getApi"]>;
  }
}

const MOBILE_WEEK_VIEW = "timeGridMobileWeek";
const MOBILE_QUERY = "(max-width: 599px), (max-height: 500px) and (max-width: 932px)";
const VIEW_STORAGE_KEY = "pouragenda-calendar-view";

const subscribeToMobileWidth = (onChange: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const getMobileWidth = () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
const getServerMobileWidth = () => false;
const localDateKey = (date: Date) => [
  date.getFullYear(),
  (date.getMonth() + 1).toString().padStart(2, "0"),
  date.getDate().toString().padStart(2, "0"),
].join("-");
const shiftDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function calendarEventsForDate(events: CalendarEvent[], dateKey: string, timezone: string) {
  const nextDateKey = shiftDateKey(dateKey, 1);
  return events
    .filter((event) => {
      if (event.allDay) return event.start.slice(0, 10) <= dateKey && event.end.slice(0, 10) > dateKey;
      const localStart = toLocalInput(event.start, timezone);
      const localEnd = toLocalInput(event.end, timezone);
      return localStart < `${nextDateKey}T00:00` && localEnd > `${dateKey}T00:00`;
    })
    .sort((left, right) => Number(right.allDay) - Number(left.allDay)
      || Date.parse(left.start) - Date.parse(right.start));
}

const dayDifference = (startKey: string, endKey: string) => (
  Date.parse(`${endKey}T00:00:00.000Z`) - Date.parse(`${startKey}T00:00:00.000Z`)
) / 86_400_000;

export function dayEventTimeLabel(event: CalendarEvent, timezone: string, timeFormat: TimeFormat) {
  if (event.allDay) return "All day";
  const startKey = toLocalInput(event.start, timezone).slice(0, 10);
  const endKey = toLocalInput(event.end, timezone).slice(0, 10);
  const extraDays = dayDifference(startKey, endKey);
  const suffix = extraDays > 0 ? ` (+${extraDays} ${extraDays === 1 ? "day" : "days"})` : "";
  return `${formatTime(event.start, timezone, timeFormat)}–${formatTime(event.end, timezone, timeFormat)}${suffix}`;
}

const daySheetTitle = (dateKey: string) => new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
}).format(new Date(`${dateKey}T12:00:00.000Z`));

function CalendarEventContent({
  id,
  title,
  category,
  categoryColor,
  textColor,
  timeText,
  recurring,
}: {
  id: string;
  title: string;
  category: string;
  categoryColor: string;
  textColor: string;
  timeText: string;
  recurring: boolean;
}) {
  const contentRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = contentRef.current?.closest<HTMLElement>(".fc-event");
    if (!element) return;
    element.dataset.appointmentId = id;
    element.style.setProperty("--category-color", categoryColor);
    element.style.setProperty("--category-text-color", textColor);
  }, [categoryColor, id, textColor]);

  return (
    <span ref={contentRef} className="calendar-event-content" aria-label={`${title}, ${category}`}>
      <strong className="calendar-event-title">{title}</strong>
      {timeText && <span className="calendar-event-time">{timeText}</span>}
      {recurring && <span className="calendar-event-recurring" aria-label="Recurring appointment">↻</span>}
    </span>
  );
}

export function calendarWallTimeToInstant(date: Date, timezone: string, allDay: boolean) {
  if (allDay) return new Date(`${localDateKey(date)}T00:00:00.000Z`);
  const localValue = [
    localDateKey(date),
    `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`,
  ].join("T");
  return new Date(localInputToUtc(localValue, timezone));
}

const compactCalendarTitle = (view: Pick<DatesSetArg["view"], "type" | "title" | "currentStart" | "currentEnd">) => {
  if (view.type === "dayGridMonth") return view.title;
  if (view.type === "listWeek") {
    const end = new Date(view.currentEnd.getTime() - 864e5);
    const format = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${format(view.currentStart)} – ${format(end)}`;
  }
  return view.currentStart.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export function responsiveCalendarView(view: string | null, mobile: boolean) {
  const requested = view ?? "dayGridMonth";
  if (mobile && requested === "timeGridWeek") return MOBILE_WEEK_VIEW;
  if (!mobile && requested === MOBILE_WEEK_VIEW) return "timeGridWeek";
  return requested;
}

export function preferredCalendarScrollTime(
  selectedDate: Date,
  events: Pick<CalendarEvent, "start" | "allDay">[],
  now = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const selectedKey = localDateKey(selectedDate);
  const nowLocal = toLocalInput(now.toISOString(), timezone);
  const isToday = selectedKey === nowLocal.slice(0, 10);
  const [nowHour, nowMinute] = nowLocal.slice(11).split(":").map(Number);
  let minutes = isToday ? Math.max(0, nowHour * 60 + nowMinute - 60) : 7 * 60;
  const earliestEvent = events
    .filter((event) => !event.allDay && toLocalInput(event.start, timezone).slice(0, 10) === selectedKey)
    .map((event) => {
      const [, time] = toLocalInput(event.start, timezone).split("T");
      const [hour, minute] = time.split(":").map(Number);
      return hour * 60 + minute;
    })
    .sort((a, b) => a - b)[0];
  if (earliestEvent !== undefined) minutes = Math.min(minutes, Math.max(0, earliestEvent - 30));
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}:00`;
}

export default function CalendarView({
  events,
  dataLoadedAt,
  onRange,
  onViewChange,
  onSelect,
  onOpen,
  onMove,
  onCreateForDate,
  timezone,
  timeFormat,
}: {
  events: CalendarEvent[];
  dataLoadedAt: number;
  onRange: (start: Date, end: Date) => void;
  onViewChange: (view: string) => void;
  onSelect: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, start: Date, end: Date, revert: () => void) => void;
  onCreateForDate: (dateKey: string) => void;
  timezone: string;
  timeFormat: TimeFormat;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useSyncExternalStore(subscribeToMobileWidth, getMobileWidth, getServerMobileWidth);
  const [initialView] = useState(() => responsiveCalendarView(
    typeof window === "undefined" ? null : localStorage.getItem(VIEW_STORAGE_KEY),
    getMobileWidth(),
  ));
  const [currentView, setCurrentView] = useState(initialView);
  const [title, setTitle] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState(() => zonedDateKey(new Date(), timezone));
  const [daySheet, setDaySheet] = useState<{ dateKey: string; trigger: HTMLElement | null } | null>(null);
  const daySheetRef = useRef<HTMLDivElement>(null);
  const swipeStartY = useRef<number | null>(null);
  const pendingScroll = useRef<{ key: string; requestedAt: number; date: Date } | null>(null);
  const completedScroll = useRef("");

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && calendarRef.current) {
      window.__pourAgendaCalendar = calendarRef.current.getApi();
      return () => { delete window.__pourAgendaCalendar; };
    }
  }, []);

  useEffect(() => {
    if (!isMobile) completedScroll.current = "";
    const frame = window.requestAnimationFrame(() => {
      const calendar = calendarRef.current?.getApi();
      if (!calendar) return;
      const responsiveView = responsiveCalendarView(calendar.view.type, isMobile);
      if (responsiveView !== calendar.view.type) calendar.changeView(responsiveView, calendar.getDate());
      else if (isMobile) setTitle(compactCalendarTitle(calendar.view));
      calendar.updateSize();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile]);

  const changeView = useCallback((view: string) => {
    const calendar = calendarRef.current?.getApi();
    if (!calendar) return;
    calendar.changeView(responsiveCalendarView(view, isMobile));
  }, [isMobile]);

  const navigate = useCallback((direction: "previous" | "next" | "today") => {
    const calendar = calendarRef.current?.getApi();
    if (!calendar) return;
    if (direction === "previous") calendar.prev();
    else if (direction === "next") calendar.next();
    else calendar.gotoDate(zonedDateKey(new Date(), timezone));
  }, [timezone]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setTitle(isMobile ? compactCalendarTitle(arg.view) : arg.view.title);
    setCurrentView(arg.view.type);
    if (arg.view.type === "timeGridDay") setSelectedDateKey(localDateKey(arg.view.currentStart));
    onViewChange(arg.view.type === MOBILE_WEEK_VIEW ? "timeGridWeek" : arg.view.type);
    onRange(arg.start, arg.end);
    if (arg.view.type === "timeGridDay" || (isMobile && arg.view.type === MOBILE_WEEK_VIEW)) {
      pendingScroll.current = {
        key: `${arg.view.type}:${arg.view.currentStart.toISOString()}`,
        requestedAt: Date.now(),
        date: arg.view.currentStart,
      };
    }
  }, [isMobile, onRange, onViewChange]);

  const viewOptions = [
    { label: "Month", view: "dayGridMonth", active: currentView === "dayGridMonth" },
    { label: "Week", view: "timeGridWeek", active: currentView === "timeGridWeek" || currentView === MOBILE_WEEK_VIEW },
    { label: "Day", view: "timeGridDay", active: currentView === "timeGridDay" },
    { label: "Agenda", view: "listWeek", active: currentView === "listWeek" },
  ];
  const isMobileTimeView = isMobile && (currentView === MOBILE_WEEK_VIEW || currentView === "timeGridDay");
  const isManagedTimeView = currentView === "timeGridDay" || (isMobile && currentView === MOBILE_WEEK_VIEW);
  const todayButtonLabel = currentView === "dayGridMonth"
    ? "Go to current month"
    : currentView === "timeGridWeek" || currentView === MOBILE_WEEK_VIEW
      ? "Go to current week"
      : currentView === "listWeek"
        ? "Go to today's agenda"
        : "Go to today";
  const productivityEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    category: event.extendedProps.category,
    categoryColor: event.backgroundColor,
    location: event.extendedProps.location,
    notes: event.extendedProps.notes,
  }));
  const displayEvents = events.map((event) => event.allDay ? event : {
    ...event,
    start: toLocalInput(event.start, timezone),
    end: toLocalInput(event.end, timezone),
  });
  const calendarTimeDisplay = fullCalendarTimeDisplayOptions(timeFormat);
  const selectedDayEvents = useMemo(
    () => daySheet ? calendarEventsForDate(events, daySheet.dateKey, timezone) : [],
    [daySheet, events, timezone],
  );
  const closeDaySheet = useCallback(() => {
    const trigger = daySheet?.trigger;
    setDaySheet(null);
    window.requestAnimationFrame(() => trigger?.focus());
  }, [daySheet]);
  const openDaySheet = useCallback((dateKey: string, trigger: HTMLElement | null) => {
    if (!calendarEventsForDate(events, dateKey, timezone).length) return;
    setDaySheet({ dateKey, trigger });
  }, [events, timezone]);

  useEffect(() => {
    if (!daySheet) return;
    const frame = window.requestAnimationFrame(() => daySheetRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [daySheet]);

  useEffect(() => {
    if (!daySheet) return;
    const application = document.querySelector<HTMLElement>("main");
    if (!application) return;
    const wasInert = application.inert;
    application.inert = true;
    return () => { application.inert = wasInert; };
  }, [daySheet]);

  useEffect(() => {
    const request = pendingScroll.current;
    if (!isManagedTimeView || !request || dataLoadedAt < request.requestedAt || completedScroll.current === request.key) return;
    const frame = window.requestAnimationFrame(() => {
      calendarRef.current?.getApi().scrollToTime(preferredCalendarScrollTime(request.date, events, new Date(), timezone));
      completedScroll.current = request.key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dataLoadedAt, events, isManagedTimeView, timezone]);

  useEffect(() => {
    if (!isMobile || currentView !== "dayGridMonth") return;
    const frame = window.requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    return () => window.cancelAnimationFrame(frame);
  }, [currentView, events, isMobile]);

  return (
    <div className="calendar-card rounded-[var(--radius)] border border-border bg-surface">
      {isMobile && <div className="calendar-toolbar">
        <div className="calendar-toolbar-primary">
          <h2 className="calendar-toolbar-title" data-view={currentView} aria-live="polite">{title}</h2>
          <div className="calendar-toolbar-navigation">
            <button type="button" onClick={() => navigate("previous")} aria-label="Previous period">
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => navigate("next")} aria-label="Next period">
              <ChevronRight size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => navigate("today")} aria-label={todayButtonLabel} className="calendar-today-button">Today</button>
          </div>
        </div>
        <div className="calendar-view-selector" role="group" aria-label="Calendar view">
          {viewOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={option.active}
              onClick={() => changeView(option.view)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>}
      {currentView === "timeGridDay" && (
        <DayExperience
          events={productivityEvents}
          dateKey={selectedDateKey}
          timezone={timezone}
          timeFormat={timeFormat}
          onOpen={onOpen}
          onCreate={onCreateForDate}
          onReturnMonth={() => changeView("dayGridMonth")}
        />
      )}
      <div className="pouragenda-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
          locale="en-US"
          firstDay={0}
          eventTimeFormat={calendarTimeDisplay}
          slotLabelFormat={calendarTimeDisplay}
          views={{
            [MOBILE_WEEK_VIEW]: {
              type: "timeGrid",
              duration: { days: 1 },
              dateIncrement: { days: 1 },
              dayHeaderFormat: { weekday: "long", month: "short", day: "numeric" },
            },
            listWeek: {
              listDayFormat: { weekday: "long", month: "short", day: "numeric" },
              listDaySideFormat: false,
            },
          }}
          headerToolbar={isMobile
            ? false
            : {
              left: "prev,next contextToday",
              center: currentView === "timeGridDay" ? "" : "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
          customButtons={{
            contextToday: {
              text: "Today",
              hint: todayButtonLabel,
              click: () => navigate("today"),
            },
          }}
          events={displayEvents}
          editable
          eventDragMinDistance={1}
          selectable
          datesSet={handleDatesSet}
          viewDidMount={(arg) => localStorage.setItem(
            VIEW_STORAGE_KEY,
            arg.view.type === MOBILE_WEEK_VIEW ? "timeGridWeek" : arg.view.type,
          )}
          select={(arg: DateSelectArg) => onSelect(
            arg.allDay ? calendarWallTimeToInstant(arg.start, timezone, true) : arg.start,
            arg.allDay ? calendarWallTimeToInstant(arg.end, timezone, true) : arg.end,
            arg.allDay,
          )}
          selectAllow={() => !(isMobile && currentView === "dayGridMonth")}
          dateClick={(arg) => {
            if (!isMobile || currentView !== "dayGridMonth") return;
            openDaySheet(arg.dateStr.slice(0, 10), arg.jsEvent.currentTarget instanceof HTMLElement
              ? arg.jsEvent.currentTarget
              : null);
          }}
          eventClick={(arg: EventClickArg) => onOpen(arg.event.id)}
          eventDidMount={(arg) => {
            arg.el.dataset.appointmentId = arg.event.id;
            const sourceEvent = events.find((event) => event.id === arg.event.id);
            if (arg.view.type === "timeGridDay" && sourceEvent && !sourceEvent.allDay) {
              const now = Date.now();
              const state = now >= Date.parse(sourceEvent.end)
                ? "past"
                : now >= Date.parse(sourceEvent.start)
                  ? "current"
                  : "future";
              arg.el.dataset.timeState = state;
              arg.el.setAttribute("aria-label", `${arg.event.title}, ${arg.event.extendedProps.category}, ${state} event`);
            }
          }}
          eventChange={(arg: EventChangeArg) => {
            if (!arg.event.start) return arg.revert();
            const end = arg.event.end ?? arg.event.start;
            onMove(
              arg.event.id,
              calendarWallTimeToInstant(arg.event.start, timezone, arg.event.allDay),
              calendarWallTimeToInstant(end, timezone, arg.event.allDay),
              arg.revert,
            );
          }}
          eventContent={(arg) => (
            <CalendarEventContent
              key={`${arg.event.id}:${arg.event.extendedProps.categoryColor}:${arg.event.textColor}`}
              id={arg.event.id}
              title={arg.event.title}
              category={arg.event.extendedProps.category}
              categoryColor={arg.event.extendedProps.categoryColor}
              textColor={arg.event.textColor}
              timeText={arg.timeText}
              recurring={arg.event.extendedProps.recurring}
            />
          )}
          dayMaxEvents={isMobile ? 1 : true}
          moreLinkContent={(arg) => `+${arg.num}`}
          moreLinkClick={(arg) => {
            if (!isMobile || currentView !== "dayGridMonth") return "popover";
            openDaySheet(arg.date.toISOString().slice(0, 10), arg.jsEvent.currentTarget instanceof HTMLElement
              ? arg.jsEvent.currentTarget
              : null);
          }}
          stickyHeaderDates
          now={() => toLocalInput(new Date().toISOString(), timezone)}
          nowIndicator={currentView !== "timeGridDay" || dayKind(selectedDateKey, timezone) === "today"}
          scrollTime="07:00:00"
          scrollTimeReset={false}
          height={currentView === "timeGridDay"
            ? isMobile
              ? "clamp(18rem, calc(100dvh - 18rem), 42rem)"
              : "clamp(28rem, calc(100dvh - 24rem), 48rem)"
            : isMobileTimeView
              ? "clamp(18rem, calc(100dvh - 18rem), 42rem)"
              : "auto"}
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day", list: "Agenda" }}
        />
      </div>
      {isMobile && daySheet && createPortal((
        <div
          className="calendar-day-sheet-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeDaySheet();
          }}
        >
          <div
            ref={daySheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-sheet-title"
            tabIndex={-1}
            className="calendar-day-sheet"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDaySheet();
            }}
            onTouchStart={(event) => { swipeStartY.current = event.touches[0]?.clientY ?? null; }}
            onTouchEnd={(event) => {
              const endY = event.changedTouches[0]?.clientY;
              if (swipeStartY.current !== null && endY !== undefined && endY - swipeStartY.current > 64) closeDaySheet();
              swipeStartY.current = null;
            }}
            onTouchCancel={() => { swipeStartY.current = null; }}
          >
            <div className="calendar-day-sheet-handle" aria-hidden="true" />
            <h2 id="calendar-day-sheet-title">{daySheetTitle(daySheet.dateKey)}</h2>
            <div className="calendar-day-sheet-list">
              {selectedDayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="calendar-day-sheet-event"
                  onClick={() => {
                    setDaySheet(null);
                    onOpen(event.id);
                  }}
                >
                  <span className="calendar-day-sheet-dot" style={{ backgroundColor: event.backgroundColor }} aria-hidden="true" />
                  <span className="calendar-day-sheet-time">{dayEventTimeLabel(event, timezone, timeFormat)}</span>
                  <span className="calendar-day-sheet-event-title">{event.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
