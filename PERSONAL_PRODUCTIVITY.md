# Personal Productivity Foundation

Phase 1 keeps PourAgenda calendar-first. Month is the first view when no prior view preference exists. The existing local preference continues to restore the last selected Month, Week, Day, or Agenda view. Today is a navigation action inside the selected view; it is not a route, tab, dashboard, or fifth view.

## Selected-day calculations

- The active account timezone determines today, tomorrow, selected-day membership, headings, countdowns, and displayed times.
- All visible occurrences on the selected date count as events. Cancelled or filtered-out records never reach these calculations.
- Timed intervals are clipped to the selected date, merged when they overlap, and summed once.
- All-day events count as events but add no artificial 24-hour duration.
- Invalid or reversed intervals are ignored for duration and free-time arithmetic.

For overlapping current events, Next Event deterministically selects the event that started most recently. Today shows a current event first, otherwise the next future timed event, otherwise an all-day event, then a free-for-the-rest-of-today state. A future date shows its first all-day event or earliest timed event without a multi-day countdown. Past dates omit Next Event and Free Time.

Free Time uses 7:00 AM–10:00 PM in the active timezone. Timed overlaps are merged, all-day events do not erase the day, and gaps shorter than 15 minutes are omitted. This is an informational summary, not a scheduling optimizer.

## Quick Add grammar

Quick Add is deterministic, local, and always opens the existing appointment editor for confirmation. It never saves directly.

Supported date phrases:

- `today`, `tomorrow`, `tonight`
- weekday names such as `Friday` or `Monday`
- English month and day such as `August 12`
- `in N hours`, for 1–99 hours

Supported time phrases:

- 12-hour times such as `2pm`, `10am`, or `at 3:30pm`
- `noon`
- `tonight`, which uses a documented 7:00 PM default when no time is supplied

Examples include `Dentist tomorrow 2pm`, `Meeting Friday 10am`, `Dinner tonight`, `Gym Monday 7pm`, `Doctor August 12 at 3pm`, `Lunch today noon`, and `Call Sarah in 2 hours`.

When only a date is recognized, the date is prefilled and the existing editor keeps its editable default time. When no safe date is recognized, only the title is prefilled. The editor explains what remains unresolved. Unsupported phrases never fabricate a precise date or time.

## Search

Global search is available only inside the authenticated application. It combines already-loaded authorized occurrences with an RLS-protected appointment query and searches locally across title, category, location, and notes.

Ranking order is:

1. exact title;
2. partial title;
3. category;
4. location;
5. notes.

Future matches receive only a small tie-breaking preference, so exact older matches remain visible. Search does not create an unauthenticated endpoint. Offline search is limited to appointments already loaded on the device.
