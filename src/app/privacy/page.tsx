import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background p-4 sm:p-8">
      <article className="mx-auto max-w-3xl rounded-[var(--radius)] border border-border bg-surface p-5 sm:p-8">
        <Link href="/login" className="text-primary">Back to PourAgenda</Link>
        <h1 className="mt-5 text-3xl font-semibold">Privacy</h1>
        <div className="mt-6 space-y-4 leading-7">
          <p>PourAgenda stores account details, settings, categories, contacts, and appointment information for scheduling. This information is private by default and protected by owner-only access rules.</p>
          <p>Public appointment sharing is optional. A shared page shows only the fields its owner explicitly allows. Private notes, contact details, and account email are not included.</p>
          <p>Browser notifications are best-effort and require permission. PourAgenda does not use SMS or paid notification services.</p>
          <p>You can export your data or permanently delete your account from Settings. Account deletion revokes public links and removes owned application data before the authentication account is removed.</p>
          <p>For privacy questions, use your existing private contact channel with the site owner.</p>
        </div>
      </article>
    </main>
  );
}
