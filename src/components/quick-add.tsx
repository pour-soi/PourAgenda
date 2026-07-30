"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { parseQuickAdd, type QuickAddResult } from "@/lib/personal-productivity";

export function QuickAdd({
  timezone,
  onParsed,
}: {
  timezone: string;
  onParsed: (result: QuickAddResult) => void;
}) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onParsed(parseQuickAdd(value, timezone));
    setValue("");
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <label htmlFor="quick-add-input">Quick Add</label>
      <div>
        <input
          id="quick-add-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Add an event…"
          autoComplete="off"
        />
        <button type="submit" aria-label="Open event editor with Quick Add">
          <Plus size={18} aria-hidden="true" />
          <span>Add</span>
        </button>
      </div>
    </form>
  );
}
