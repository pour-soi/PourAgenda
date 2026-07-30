import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const parse = (path) => Object.fromEntries(
  fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);
const app = parse(".env.local");
const users = parse(".env.rls-test");
const appointmentPrefixes = [
  "E2E ", "Pagination ", "Conflict base ", "Conflict override ", "Cancelled conflict ",
  "Cancelled ignored ", "Status flow ", "Stale base ", "Calendar move ", "Physical resize ",
  "Physical drag ", "Recurring E2E ", "Recurring contexts ", "Recurring creation ",
  "Recurring lists ", "Recurring pointer ", "Recurring destructive ", "Recurring unrelated ",
  "Recurring conflict ", "Phase 4 share ", "Reminder verification ", "Export ", "Foreign ",
  "Large export ", "Activity ", "Expired session ",
];
const contactPrefixes = ["Activity contact ", "=SUM(1), Export ", "Foreign "];

let temporaryAppointments = 0;
let temporaryContacts = 0;
let activeShares = 0;
for (const user of ["A", "B"]) {
  const client = createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({
    email: users[`POURAGENDA_TEST_USER_${user}_EMAIL`],
    password: users[`POURAGENDA_TEST_USER_${user}_PASSWORD`],
  });
  if (loginError) throw new Error("Disposable test account authentication failed.");
  for (const prefix of appointmentPrefixes) {
    const { count, error } = await client.from("appointments")
      .select("id", { count: "exact", head: true }).like("title", `${prefix}%`);
    if (error) throw new Error("Production appointment cleanup verification failed.");
    temporaryAppointments += count ?? 0;
  }
  for (const prefix of contactPrefixes) {
    const { count, error } = await client.from("contacts")
      .select("id", { count: "exact", head: true }).like("name", `${prefix}%`);
    if (error) throw new Error("Production contact cleanup verification failed.");
    temporaryContacts += count ?? 0;
  }
  const { count, error } = await client.from("appointment_shares")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error("Production share cleanup verification failed.");
  activeShares += count ?? 0;
  await client.auth.signOut();
}

const result = {
  temporary_appointments_remaining: temporaryAppointments,
  temporary_contacts_remaining: temporaryContacts,
  active_test_shares_remaining: activeShares,
};
console.log(JSON.stringify(result));
if (Object.values(result).some((count) => count !== 0)) process.exitCode = 1;
