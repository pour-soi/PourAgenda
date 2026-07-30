"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DayExperience } from "@/components/day-experience";
import { localInputToUtc, toLocalInput } from "@/lib/appointments";
import { dayKind, zonedDateKey } from "@/lib/personal-productivity";
import type { TimeFormat } from "@/lib/date-format";

declare global {
  interface Window {
    __pourAgendaCalendar?: ReturnType<FullCalendar["getApi"]>;
  }
}

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  classNames: string[];
  extendedProps: { category: string; recurring: boolean; location?: string | null; notes?: string | null };
};

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

  useEffect(() => {
    const request = pendingScroll.current;
    if (!isManagedTimeView || !request || dataLoadedAt < request.requestedAt || completedScroll.current === request.key) return;
    const frame = window.requestAnimationFrame(() => {
      calendarRef.current?.getApi().scrollToTime(preferredCalendarScrollTime(request.date, events, new Date(), timezone));
      completedScroll.current = request.key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dataLoadedAt, events, isManagedTimeView, timezone]);

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
          eventTimeFormat={{ hour: timeFormat === "24h" ? "2-digit" : "numeric", minute: "2-digit", hour12: timeFormat === "12h" }}
          slotLabelFormat={{ hour: timeFormat === "24h" ? "2-digit" : "numeric", minute: "2-digit", hour12: timeFormat === "12h" }}
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
          select={(arg: DateSelectArg) => onSelect(arg.start, arg.end, arg.allDay)}
          eventClick={(arg: EventClickArg) => onOpen(arg.event.id)}
          eventDidMount={(arg) => {
            arg.el.dataset.appointmentId = arg.event.id;
            arg.el.style.setProperty("--category-color", arg.event.backgroundColor);
            arg.el.style.setProperty("--category-text-color", arg.event.textColor);
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
            <span className="calendar-event-content" aria-label={`${arg.event.title}, ${arg.event.extendedProps.category}`}>
              <strong className="calendar-event-title">{arg.event.title}</strong>
              {arg.timeText && <span className="calendar-event-time">{arg.timeText}</span>}
              {arg.event.extendedProps.recurring && <span className="calendar-event-recurring" aria-label="Recurring appointment">↻</span>}
            </span>
          )}
          dayMaxEvents={isMobile ? 1 : true}
          moreLinkContent={(arg) => `+${arg.num}`}
          moreLinkClick="popover"
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
    </div>
  );
}
