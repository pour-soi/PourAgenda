"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <button disabled={pending} onClick={async () => {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }} className="flex w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-background disabled:opacity-60">
    <LogOut size={18} /> {pending ? "Signing out…" : "Sign out"}
  </button>;
}
