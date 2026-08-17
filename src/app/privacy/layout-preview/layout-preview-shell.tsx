"use client";

import { useEffect, useState } from "react";
import { AgendaShell } from "@/components/agenda-shell";

const categories = [
  { id: "focus", name: "Focus", color: "#375f52", hidden: false },
  { id: "personal", name: "Personal", color: "#a26068", hidden: false },
  { id: "planning", name: "Planning", color: "#5e7296", hidden: false },
];

export function LayoutPreviewShell({ timeFormatPreference, automaticTimezone, delayCategories }: {
  timeFormatPreference: "locale" | "12h" | "24h";
  automaticTimezone: boolean;
  delayCategories: boolean;
}) {
  const [visibleCategories, setVisibleCategories] = useState(delayCategories ? [] : categories);
  useEffect(() => {
    if (!delayCategories) return;
    const timer = window.setTimeout(() => setVisibleCategories(categories), 100);
    return () => window.clearTimeout(timer);
  }, [delayCategories]);
  return <AgendaShell email="Private local preview" userId="layout-preview" timezone="UTC"
    automaticTimezone={automaticTimezone} timeFormatPreference={timeFormatPreference}
    defaultDuration={60} defaultReminders={[10]} categories={visibleCategories}/>;
}
