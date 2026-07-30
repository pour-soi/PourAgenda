import { notFound } from "next/navigation";
import { AgendaShell } from "@/components/agenda-shell";

export default function LayoutPreviewPage() {
  if (process.env.POURAGENDA_LAYOUT_PREVIEW !== "1") notFound();

  return (
    <AgendaShell
      email="Private local preview"
      userId="layout-preview"
      timezone="UTC"
      timeFormat="12h"
      defaultReminders={[10]}
      categories={[
        { id: "focus", name: "Focus", color: "#375f52", hidden: false },
        { id: "personal", name: "Personal", color: "#a26068", hidden: false },
        { id: "planning", name: "Planning", color: "#5e7296", hidden: false },
      ]}
    />
  );
}
