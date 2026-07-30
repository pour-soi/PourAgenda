"use client";

import { useEffect, useMemo, useState } from "react";
import {
  daySummary,
  eventsForDate,
  freeTimeSummary,
  nextEventForDay,
  selectedDateHeading,
  type ProductivityEvent,
} from "@/lib/personal-productivity";

function eventTime(event: ProductivityEvent, timezone: string) {
  if (event.allDay) return "All day";
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(event.start))}–${formatter.format(new Date(event.end))}`;
}

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    let interval = 0;
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return now;
}

export function DayExperience({
  events,
  dateKey,
  timezone,
  onOpen,
  onCreate,
  onReturnMonth,
}: {
  events: ProductivityEvent[];
  dateKey: string;
  timezone: string;
  onOpen: (id: string) => void;
  onCreate: (dateKey: string) => void;
  onReturnMonth: () => void;
}) {
  const now = useMinuteClock();
  const heading = useMemo(() => selectedDateHeading(dateKey, timezone, now), [dateKey, timezone, now]);
  const selectedEvents = useMemo(() => eventsForDate(events, dateKey, timezone), [dateKey, events, timezone]);
  const summary = useMemo(() => daySummary(events, dateKey, timezone), [dateKey, events, timezone]);
  const next = useMemo(() => nextEventForDay(events, dateKey, timezone, now), [dateKey, events, now, timezone]);
  const freeTime = useMemo(() => freeTimeSummary(events, dateKey, timezone, now), [dateKey, events, now, timezone]);

  return (
    <section className="day-experience" aria-labelledby="selected-day-heading">
      <div className="day-experience-heading">
        {heading.relativeLabel && <p>{heading.relativeLabel}</p>}
        <h2 id="selected-day-heading">{heading.fullDate}</h2>
        <span aria-label={`${summary.count} events, ${summary.occupiedMinutes} scheduled minutes`}>
          {summary.label}
        </span>
      </div>

      <div className="day-insight-group">
        {next.kind !== "past" && (
          <section className="day-insight" aria-labelledby="next-event-heading">
            <h3 id="next-event-heading">Next event</h3>
            {next.event ? (
              <button type="button" className="day-next-event" onClick={() => onOpen(next.event.id)}>
                <span
                  className="day-category-dot"
                  style={{ backgroundColor: next.event.categoryColor ?? "#667168" }}
                  aria-hidden="true"
                />
                <span className="day-next-event-copy">
                  <strong>{next.event.title}</strong>
                  <span>{eventTime(next.event, timezone)} · {next.event.category}</span>
                </span>
                <span className="day-next-event-state">{next.label}</span>
              </button>
            ) : (
              <div className="day-empty-copy">
                <p>{next.label}</p>
                {next.kind === "empty" && (
                  <div>
                    <button type="button" onClick={() => onCreate(dateKey)}>Create event</button>
                    <button type="button" onClick={onReturnMonth}>Return to Month</button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {freeTime && (
          <section className="day-insight day-free-time" aria-labelledby="free-time-heading">
            <h3 id="free-time-heading">Free time</h3>
            <p>{freeTime}</p>
            <span>7:00 AM–10:00 PM · gaps under 15m omitted</span>
          </section>
        )}
      </div>

      {selectedEvents.some((event) => event.allDay) && (
        <p className="day-all-day-note">
          {selectedEvents.filter((event) => event.allDay).length} all-day
          {selectedEvents.filter((event) => event.allDay).length === 1 ? " event" : " events"} shown in the timeline
        </p>
      )}
    </section>
  );
}
