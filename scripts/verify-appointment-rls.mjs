import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const parse = (path) => Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = parse(".env.local");
const credentials = { ...(fs.existsSync(".env.rls-test") ? parse(".env.rls-test") : {}), ...process.env };
const required = ["POURAGENDA_TEST_USER_A_EMAIL", "POURAGENDA_TEST_USER_A_PASSWORD", "POURAGENDA_TEST_USER_B_EMAIL", "POURAGENDA_TEST_USER_B_PASSWORD"];
if (required.some((name) => !credentials[name])) throw new Error("Two confirmed disposable test accounts are required.");
const client = () => createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const a = client(), b = client(), anonymous = client();
const login = async (instance, email, password) => {
  const { data, error } = await instance.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("A disposable test account could not sign in.");
  return data.user.id;
};
const checks = {
  owner_crud: false, cross_user_read_blocked: false, cross_user_update_blocked: false,
  cross_user_delete_blocked: false, foreign_user_id_injection_blocked: false,
  foreign_category_assignment_blocked: false, anonymous_access_denied: false, temporary_data_removed: false,
};
let appointmentId;
let injectedTitle;
try {
  const aId = await login(a, credentials.POURAGENDA_TEST_USER_A_EMAIL, credentials.POURAGENDA_TEST_USER_A_PASSWORD);
  await login(b, credentials.POURAGENDA_TEST_USER_B_EMAIL, credentials.POURAGENDA_TEST_USER_B_PASSWORD);
  const [{ data: aCategory }, { data: bCategory }] = await Promise.all([
    a.from("categories").select("id").limit(1).single(), b.from("categories").select("id").limit(1).single(),
  ]);
  const title = `Appointment RLS ${randomUUID()}`;
  const start = new Date(Date.now() + 864e5).toISOString();
  const end = new Date(Date.now() + 90 * 60_000 + 864e5).toISOString();
  const payload = { user_id: aId, category_id: aCategory.id, title, kind: "work", starts_at: start, ends_at: end,
    timezone: "UTC", intended_local_start: start.slice(0, 19).replace("T", " "),
    intended_local_end: end.slice(0, 19).replace("T", " "), all_day: false };
  const created = await a.from("appointments").insert(payload).select("*").single();
  if (created.error) throw new Error("Owner appointment creation failed.");
  appointmentId = created.data.id;
  const read = await a.from("appointments").select("id").eq("id", appointmentId);
  const update = await a.from("appointments").update({ title: `${title} updated` }).eq("id", appointmentId).select("id");
  const [crossRead, crossUpdate, crossDelete] = await Promise.all([
    b.from("appointments").select("id").eq("id", appointmentId),
    b.from("appointments").update({ title: "forbidden" }).eq("id", appointmentId).select("id"),
    b.from("appointments").delete().eq("id", appointmentId).select("id"),
  ]);
  const stillThere = await a.from("appointments").select("id").eq("id", appointmentId);
  checks.cross_user_read_blocked = !crossRead.error && crossRead.data.length === 0;
  checks.cross_user_update_blocked = !crossUpdate.error && crossUpdate.data.length === 0;
  checks.cross_user_delete_blocked = !crossDelete.error && crossDelete.data.length === 0 && stillThere.data.length === 1;
  injectedTitle = `Foreign owner ${randomUUID()}`;
  const foreignOwner = await b.from("appointments").insert({ ...payload, title: injectedTitle });
  const injectedRead = await a.from("appointments").select("id").eq("title", injectedTitle);
  checks.foreign_user_id_injection_blocked = Boolean(foreignOwner.error) && injectedRead.data.length === 0;
  const foreignCategory = await a.from("appointments").update({ category_id: bCategory.id }).eq("id", appointmentId);
  const categoryUnchanged = await a.from("appointments").select("category_id").eq("id", appointmentId).single();
  checks.foreign_category_assignment_blocked = Boolean(foreignCategory.error) && categoryUnchanged.data.category_id === aCategory.id;
  const anon = await anonymous.from("appointments").select("id").limit(1);
  checks.anonymous_access_denied = Boolean(anon.error);
  checks.owner_crud = read.data.length === 1 && update.data.length === 1;
} finally {
  if (appointmentId) {
    const removed = await a.from("appointments").delete().eq("id", appointmentId);
    const after = await a.from("appointments").select("id").eq("id", appointmentId);
    checks.temporary_data_removed = !removed.error && after.data.length === 0;
  }
  if (injectedTitle) await a.from("appointments").delete().eq("title", injectedTitle);
  await Promise.all([a.auth.signOut(), b.auth.signOut(), anonymous.auth.signOut()]);
}
console.log(JSON.stringify(checks));
if (Object.values(checks).some((value) => !value)) process.exit(1);
