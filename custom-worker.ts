// The OpenNext worker is generated at build time.
// @ts-expect-error generated module is unavailable before the OpenNext build
import handler from "./.open-next/worker.js";
import { runPersonalAppointmentReminderDispatch, type PushWorkerEnv } from "./src/lib/push-dispatch";

const worker = {
  fetch: handler.fetch,
  async scheduled(controller: { scheduledTime: number }, env: PushWorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(runPersonalAppointmentReminderDispatch(env, new Date(controller.scheduledTime)));
  },
};

export default worker;
