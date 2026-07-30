"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { searchEvents, type SearchableEvent } from "@/lib/personal-productivity";

function resultDate(item: SearchableEvent, timezone: string) {
  const date = new Date(item.startsAt);
  const day = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  if (item.allDay) return `${day} · All day`;
  const time = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
}

export function GlobalEventSearch({
  open,
  events,
  timezone,
  loading,
  error,
  online,
  onClose,
  onOpen,
  onRetry,
}: {
  open: boolean;
  events: SearchableEvent[];
  timezone: string;
  loading: boolean;
  error: string;
  online: boolean;
  onClose: () => void;
  onOpen: (item: SearchableEvent) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const results = useMemo(() => searchEvents(events, query), [events, query]);
  const activeIndex = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => {
    if (!open) return;
    priorFocus.current = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => priorFocus.current?.focus();
  }, [open]);

  if (!open) return null;

  function handleDialogKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="search-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="global-search"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        onKeyDown={handleDialogKey}
      >
        <div className="global-search-heading">
          <div>
            <h2 id="global-search-title">Search events</h2>
            <p>Title, notes, location, or category</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close search"><X aria-hidden="true" /></button>
        </div>
        <label className="global-search-input">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search events</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && results.length) {
                event.preventDefault();
                setSelected((value) => (value + 1) % results.length);
              } else if (event.key === "ArrowUp" && results.length) {
                event.preventDefault();
                setSelected((value) => (value - 1 + results.length) % results.length);
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                onOpen(results[activeIndex]);
              }
            }}
            placeholder="Search your calendar"
            autoComplete="off"
            aria-controls="global-search-results"
            aria-activedescendant={results[activeIndex] ? `search-result-${results[activeIndex].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>

        {!online && <p className="search-notice">Offline results are limited to appointments already loaded on this device.</p>}
        <div id="global-search-results" className="global-search-results" role="listbox" aria-label="Event search results">
          {loading && <p role="status">Loading authorized events…</p>}
          {!loading && error && (
            <div className="search-state" role="alert">
              <p>{error}</p>
              <button type="button" onClick={onRetry}>Retry</button>
            </div>
          )}
          {!loading && !error && !query.trim() && <p className="search-state">Start typing to search your authorized events.</p>}
          {!loading && !error && query.trim() && !results.length && <p className="search-state">No events found.</p>}
          {!loading && !error && results.map((item, index) => (
            <button
              id={`search-result-${item.id}`}
              key={`${item.id}:${item.startsAt}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setSelected(index)}
              onClick={() => onOpen(item)}
              className="global-search-result"
            >
              <span className="search-result-dot" style={{ backgroundColor: item.categoryColor }} aria-hidden="true" />
              <span className="search-result-copy">
                <strong>{item.title}</strong>
                <span>{resultDate(item, timezone)} · {item.category}</span>
                {item.context && <small>{item.context}</small>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
