import Image from "next/image";

export default function OfflinePage() {
  return <main className="grid min-h-dvh place-items-center p-6"><div className="max-w-md text-center"><Image src="/icon.svg" alt="PourAgenda" width={80} height={80} className="mx-auto mb-5 rounded-2xl"/><h1 className="text-2xl font-semibold">You’re offline</h1><p className="mt-3 text-muted">Recently cached pages may still be available. Reconnect before creating or changing an appointment.</p></div></main>;
}
