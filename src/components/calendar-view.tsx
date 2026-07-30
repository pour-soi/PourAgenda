"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, DatesSetArg, EventChangeArg, EventClickArg } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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
  extendedProps: { category: string; recurring: boolean };
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

const compactCalendarTitle = (view: Pick<DatesSetArg["view"], "type" | "title" | "currentStart" | "currentEnd">) => {
  if (view.type === "dayGridMonth") return view.title;
  if (view.type === "listWeek") {
    const end = new Date(view.currentEnd.getTime() - 864e5);
    const format = (date: Date) => date.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${format(view.currentStart)} – ${format(end)}`;
  }
  return view.currentStart.toLocaleDateString([], {
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
) {
  const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const isToday = dateKey(selectedDate) === dateKey(now);
  let minutes = isToday ? Math.max(0, now.getHours() * 60 + now.getMinutes() - 60) : 7 * 60;
  const earliestEvent = events
    .filter((event) => !event.allDay && dateKey(new Date(event.start)) === dateKey(selectedDate))
    .map((event) => {
      const start = new Date(event.start);
      return start.getHours() * 60 + start.getMinutes();
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
}: {
  events: CalendarEvent[];
  dataLoadedAt: number;
  onRange: (start: Date, end: Date) => void;
  onViewChange: (view: string) => void;
  onSelect: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, start: Date, end: Date, revert: () => void) => void;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useSyncExternalStore(subscribeToMobileWidth, getMobileWidth, getServerMobileWidth);
  const [initialView] = useState(() => responsiveCalendarView(
    typeof window === "undefined" ? null : localStorage.getItem(VIEW_STORAGE_KEY),
    getMobileWidth(),
  ));
  const [currentView, setCurrentView] = useState(initialView);
  const [title, setTitle] = useState("");
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
    else calendar.today();
  }, []);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setTitle(isMobile ? compactCalendarTitle(arg.view) : arg.view.title);
    setCurrentView(arg.view.type);
    onViewChange(arg.view.type === MOBILE_WEEK_VIEW ? "timeGridWeek" : arg.view.type);
    onRange(arg.start, arg.end);
    if (isMobile && (arg.view.type === MOBILE_WEEK_VIEW || arg.view.type === "timeGridDay")) {
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

  useEffect(() => {
    const request = pendingScroll.current;
    if (!isMobileTimeView || !request || dataLoadedAt < request.requestedAt || completedScroll.current === request.key) return;
    const frame = window.requestAnimationFrame(() => {
      calendarRef.current?.getApi().scrollToTime(preferredCalendarScrollTime(request.date, events));
      completedScroll.current = request.key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dataLoadedAt, events, isMobileTimeView]);

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
            <button type="button" onClick={() => navigate("today")} className="calendar-today-button">Today</button>
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
      <div className="pouragenda-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
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
            : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          events={events}
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
          }}
          eventChange={(arg: EventChangeArg) => {
            if (!arg.event.start) return arg.revert();
            onMove(arg.event.id, arg.event.start, arg.event.end ?? arg.event.start, arg.revert);
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
          nowIndicator
          height={isMobileTimeView ? "clamp(18rem, calc(100dvh - 18rem), 42rem)" : "auto"}
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day", list: "Agenda" }}
        />
      </div>
    </div>
  );
}
