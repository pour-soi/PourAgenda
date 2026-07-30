"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="max-w-md text-center">
    <h1 className="text-2xl font-semibold">PourAgenda couldn’t load this page</h1>
    <p className="mt-3 text-muted">Check your connection and Supabase setup, then try again.</p>
    <button onClick={reset} className="mt-6 rounded-lg bg-primary px-4 font-semibold text-white">Try again</button>
  </div></main>;
}
