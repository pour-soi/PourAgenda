import Link from "next/link";
import type { ReactNode } from "react";

export function AuthPage({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 sm:p-8">
    {children}
    <Link href="/privacy" className="text-sm text-muted underline">Privacy policy</Link>
  </main>;
}
