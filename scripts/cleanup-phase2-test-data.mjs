import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const parse = (path) => Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = parse(".env.local");
const test = parse(".env.rls-test");
const client = createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { error: loginError } = await client.auth.signInWithPassword({
  email: test.POURAGENDA_TEST_USER_A_EMAIL,
  password: test.POURAGENDA_TEST_USER_A_PASSWORD,
});
if (loginError) throw new Error("Disposable test account authentication failed.");
const prefixes = [
  "E2E ", "Pagination ", "Conflict base ", "Conflict override ", "Cancelled conflict ",
  "Cancelled ignored ", "Status flow ", "Stale base ", "Calendar move ",
  "Physical resize ", "Physical drag ", "Recurring E2E ",
  "Recurring contexts ", "Recurring creation ", "Recurring lists ", "Recurring pointer ",
  "Recurring destructive ", "Recurring unrelated ", "Recurring conflict ",
  "Phase 4 share ", "Reminder verification ", "Export ", "Foreign ", "Large export ",
  "Activity ", "Expired session ",
];
let removed = 0;
for (const prefix of prefixes) {
  const { data, error } = await client.from("appointments").delete().like("title", `${prefix}%`).select("id");
  if (error) throw new Error("Disposable Phase 2 test cleanup failed.");
  removed += data.length;
}
const contactPrefixes = ["Activity contact ", "=SUM(1), Export ", "Foreign "];
let contactsRemoved = 0;
for (const prefix of contactPrefixes) {
  const { data, error } = await client.from("contacts").delete().like("name", `${prefix}%`).select("id");
  if (error) throw new Error("Disposable Phase 4 contact cleanup failed.");
  contactsRemoved += data.length;
}
const { data: activityRows, error: activityError } = await client.from("appointment_activity").delete()
  .is("appointment_id", null)
  .in("action", ["contact_created", "contact_updated", "contact_deleted", "reminder_changed", "export_requested"])
  .select("id");
if (activityError) throw new Error("Disposable Phase 4 activity cleanup failed.");
const remainingAppointments = [];
for (const prefix of prefixes) {
  const { count, error } = await client.from("appointments").select("id", { count: "exact", head: true }).like("title", `${prefix}%`);
  if (error) throw new Error("Disposable appointment cleanup verification failed.");
  remainingAppointments.push(count ?? 0);
}
const { count: activeShares, error: sharesError } = await client.from("appointment_shares")
  .select("id", { count: "exact", head: true });
if (sharesError) throw new Error("Disposable sharing cleanup verification failed.");
await client.auth.signOut();
console.log(JSON.stringify({
  disposable_appointments_removed: removed,
  disposable_contacts_removed: contactsRemoved,
  disposable_activity_removed: activityRows.length,
  temporary_appointments_remaining: remainingAppointments.reduce((sum, count) => sum + count, 0),
  active_test_shares_remaining: activeShares ?? 0,
}));
