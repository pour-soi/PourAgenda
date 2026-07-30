import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const parse = (path) => Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = parse(".env.local"), credentials = parse(".env.rls-test");
const client = () => createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const a = client(), b = client(), anonymous = client();
const login = async (instance, key) => {
  const { data, error } = await instance.auth.signInWithPassword({
    email: credentials[`POURAGENDA_TEST_USER_${key}_EMAIL`],
    password: credentials[`POURAGENDA_TEST_USER_${key}_PASSWORD`],
  });
  if (error || !data.user) throw new Error("Disposable test account sign-in failed.");
  return data.user.id;
};
const checks = { owner_crud: false, cross_read_blocked: false, cross_update_blocked: false,
  cross_delete_blocked: false, foreign_owner_blocked: false, foreign_contact_link_blocked: false,
  anonymous_denied: false, appointment_survives_contact_delete: false, cleanup: false };
let contactId, appointmentId;
try {
  const aId = await login(a, "A"); await login(b, "B");
  const name = `Contact RLS ${randomUUID()}`;
  const created = await a.from("contacts").insert({ user_id: aId, name }).select("*").single();
  if (created.error) throw new Error("Owner contact creation failed.");
  contactId = created.data.id;
  const read = await a.from("contacts").select("id").eq("id", contactId);
  const update = await a.from("contacts").update({ organization: "Updated" }).eq("id", contactId).select("id");
  const [crossRead, crossUpdate, crossDelete] = await Promise.all([
    b.from("contacts").select("id").eq("id", contactId),
    b.from("contacts").update({ name: "Forbidden" }).eq("id", contactId).select("id"),
    b.from("contacts").delete().eq("id", contactId).select("id"),
  ]);
  checks.owner_crud = read.data?.length === 1 && update.data?.length === 1;
  checks.cross_read_blocked = !crossRead.error && crossRead.data.length === 0;
  checks.cross_update_blocked = !crossUpdate.error && crossUpdate.data.length === 0;
  checks.cross_delete_blocked = !crossDelete.error && crossDelete.data.length === 0;
  checks.foreign_owner_blocked = Boolean((await b.from("contacts").insert({ user_id: aId, name: "Forbidden" })).error);
  const { data: category } = await a.from("categories").select("id").limit(1).single();
  const start = new Date(Date.now() + 864e5), end = new Date(start.getTime() + 3600e3);
  const appointment = await a.from("appointments").insert({ user_id: aId, category_id: category.id,
    contact_id: contactId, title: name, kind: "personal", starts_at: start.toISOString(), ends_at: end.toISOString(),
    intended_local_start: start.toISOString().slice(0,19).replace("T"," "), intended_local_end: end.toISOString().slice(0,19).replace("T"," "),
    timezone: "UTC", all_day: false }).select("id").single();
  appointmentId = appointment.data?.id;
  const bContact = await b.from("contacts").insert({ user_id: (await b.auth.getUser()).data.user.id, name }).select("id").single();
  checks.foreign_contact_link_blocked = Boolean((await a.from("appointments").update({ contact_id: bContact.data.id }).eq("id", appointmentId)).error);
  await b.from("contacts").delete().eq("id", bContact.data.id);
  await a.from("contacts").delete().eq("id", contactId); contactId = undefined;
  const survivor = await a.from("appointments").select("id,contact_id").eq("id", appointmentId).single();
  checks.appointment_survives_contact_delete = !survivor.error && survivor.data.contact_id === null;
  checks.anonymous_denied = Boolean((await anonymous.from("contacts").select("id").limit(1)).error);
} finally {
  if (appointmentId) await a.from("appointments").delete().eq("id", appointmentId);
  if (contactId) await a.from("contacts").delete().eq("id", contactId);
  const leftovers = await a.from("contacts").select("id").like("name", "Contact RLS%");
  checks.cleanup = !leftovers.error && leftovers.data.length === 0;
  await Promise.all([a.auth.signOut(), b.auth.signOut(), anonymous.auth.signOut()]);
}
console.log(JSON.stringify(checks));
if (Object.values(checks).some((value) => !value)) process.exit(1);
