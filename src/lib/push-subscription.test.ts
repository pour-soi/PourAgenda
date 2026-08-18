import { describe, expect, it, vi } from "vitest";
import { disableBrowserPush } from "./push-subscription";

describe("disableBrowserPush", () => {
  it("unsubscribes before removing only the stored endpoint", async () => {
    const order: string[] = [];
    const unsubscribe = vi.fn(async () => { order.push("browser"); return true; });
    const registration = { pushManager: { getSubscription: async () => ({ endpoint: "https://push.invalid/approved", unsubscribe }) } } as unknown as ServiceWorkerRegistration;
    await disableBrowserPush(registration, async (endpoint) => { order.push(`database:${endpoint}`); });
    expect(order).toEqual(["browser", "database:https://push.invalid/approved"]);
  });
  it("allows orphaned owner subscriptions to be disabled when no browser subscription remains", async () => {
    const remove = vi.fn(async () => undefined);
    const registration = { pushManager: { getSubscription: async () => null } } as unknown as ServiceWorkerRegistration;
    await disableBrowserPush(registration, remove);
    expect(remove).toHaveBeenCalledWith(null);
  });
});
