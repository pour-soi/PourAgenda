export async function disableBrowserPush(
  registration: ServiceWorkerRegistration,
  removeStoredSubscription: (endpoint: string | null) => Promise<void>,
) {
  const subscription = await registration.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;
  if (subscription) await subscription.unsubscribe();
  await removeStoredSubscription(endpoint);
}
