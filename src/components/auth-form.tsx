"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/notification-deep-link";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthForm({ mode, nextPath = "/" }: { mode: Mode; nextPath?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const ready = true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(safeInternalPath(nextPath));
        router.refresh();
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=/settings`,
            data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/settings");
          router.refresh();
        } else {
          setMessage("Check your email to confirm your PourAgenda account.");
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setMessage("If that address has an account, a reset link is on its way.");
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated. You can continue to PourAgenda.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const title = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const button = { login: "Sign in", register: "Create account", forgot: "Send reset link", reset: "Update password" }[mode];
  return (
    <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-surface p-6 sm:p-8">
      <p className="text-sm font-semibold text-primary">PourAgenda</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Private scheduling for work and life.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {mode !== "reset" && <label className="block text-sm font-medium">Email
          <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-lg border border-border bg-background px-3" />
        </label>}
        {!["forgot"].includes(mode) && <label className="block text-sm font-medium">Password
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 8} required className="mt-2 w-full rounded-lg border border-border bg-background px-3" />
        </label>}
        {message && <p role="status" className="rounded-lg bg-background p-3 text-sm">{message}</p>}
        <button disabled={!ready || pending} className="w-full rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60">{pending ? "Please wait…" : button}</button>
      </form>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary">
        {mode !== "login" && <Link href="/login">Sign in</Link>}
        {mode === "login" && <><Link href="/register">Create account</Link><Link href="/forgot-password">Forgot password?</Link></>}
      </div>
    </div>
  );
}

