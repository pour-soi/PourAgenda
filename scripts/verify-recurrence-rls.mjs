import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const parse = (path) => Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
}));
const app = parse(".env.local");
const users = parse(".env.rls-test");
const client = () => createClient(app.NEXT_PUBLIC_SUPABASE_URL, app.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const a = client(), b = client(), anonymous = client();
const login = async (value, name) => {
  const { data, error } = await value.auth.signInWithPassword({
    email: users[`POURAGENDA_TEST_USER_${name}_EMAIL`], password: users[`POURAGENDA_TEST_USER_${name}_PASSWORD`],
  });
  if (error || !data.user) throw new Error("Disposable recurrence account authentication failed.");
  return data.user.id;
};
const checks = {};
let aSeriesId, bSeriesId;
try {
  const [aId, bId] = await Promise.all([login(a, "A"), login(b, "B")]);
  const [aCategory, bCategory] = await Promise.all([
    a.from("categories").select("id").limit(1).single(), b.from("categories").select("id").limit(1).single(),
  ]);
  const start = new Date(Date.now() + 2 * 864e5); start.setUTCHours(17, 0, 0, 0);
  const payload = (userId, categoryId, title) => ({
    user_id: userId, category_id: categoryId, title, kind: "work", starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3600e3).toISOString(), timezone: "UTC",
    intended_local_start: start.toISOString().slice(0, 19).replace("T", " "),
    intended_local_end: new Date(start.getTime() + 3600e3).toISOString().slice(0, 19).replace("T", " "),
    all_day: false, recurrence_frequency: "weekly", recurrence_interval: 1,
  });
  const [aSeries, bSeries] = await Promise.all([
    a.from("appointments").insert(payload(aId, aCategory.data.id, `RLS recurrence A ${randomUUID()}`)).select("*").single(),
    b.from("appointments").insert(payload(bId, bCategory.data.id, `RLS recurrence B ${randomUUID()}`)).select("*").single(),
  ]);
  if (aSeries.error || bSeries.error) throw new Error("Owner recurrence series creation failed.");
  aSeriesId = aSeries.data.id; bSeriesId = bSeries.data.id;
  const exceptionPayload = { ...payload(aId, aCategory.data.id, "RLS recurrence exception"),
    recurrence_frequency: null, recurrence_interval: null, series_id: aSeriesId,
    original_occurrence_start: start.toISOString() };
  const exception = await a.from("appointments").insert(exceptionPayload).select("*").single();
  if (exception.error) throw new Error("Owner recurrence exception creation failed.");
  const ownerUpdate = await a.from("appointments").update({ recurrence_interval: 2 })
    .eq("id", aSeriesId).eq("updated_at", aSeries.data.updated_at).select("id");
  const [foreignSeriesRead, foreignExceptionRead, foreignUpdate, foreignDelete] = await Promise.all([
    b.from("appointments").select("id").eq("id", aSeriesId),
    b.from("appointments").select("id").eq("id", exception.data.id),
    b.from("appointments").update({ recurrence_interval: 3 }).eq("id", aSeriesId).select("id"),
    b.from("appointments").delete().eq("id", exception.data.id).select("id"),
  ]);
  const foreignException = await b.from("appointments").insert({
    ...payload(bId, bCategory.data.id, "Forbidden foreign series exception"),
    recurrence_frequency: null, recurrence_interval: null, series_id: aSeriesId,
    original_occurrence_start: start.toISOString(),
  });
  const foreignOwner = await b.from("appointments").insert({ ...exceptionPayload, title: "Forbidden foreign owner" });
  const anon = await anonymous.from("appointments").select("id").limit(1);
  checks.owner_series_crud = ownerUpdate.data?.length === 1;
  checks.owner_exception_crud = Boolean(exception.data);
  checks.cross_user_series_read_blocked = !foreignSeriesRead.error && foreignSeriesRead.data.length === 0;
  checks.cross_user_exception_read_blocked = !foreignExceptionRead.error && foreignExceptionRead.data.length === 0;
  checks.cross_user_update_blocked = !foreignUpdate.error && foreignUpdate.data.length === 0;
  checks.cross_user_delete_blocked = !foreignDelete.error && foreignDelete.data.length === 0;
  checks.foreign_series_injection_blocked = Boolean(foreignException.error);
  checks.foreign_user_id_injection_blocked = Boolean(foreignOwner.error);
  checks.anonymous_access_denied = Boolean(anon.error);
} finally {
  if (aSeriesId) await a.from("appointments").delete().eq("id", aSeriesId);
  if (bSeriesId) await b.from("appointments").delete().eq("id", bSeriesId);
  const [aLeftovers, bLeftovers] = await Promise.all([
    aSeriesId ? a.from("appointments").select("id").eq("id", aSeriesId) : { data: [], error: null },
    bSeriesId ? b.from("appointments").select("id").eq("id", bSeriesId) : { data: [], error: null },
  ]);
  checks.temporary_data_removed = !aLeftovers.error && !bLeftovers.error
    && aLeftovers.data.length === 0 && bLeftovers.data.length === 0;
  await Promise.all([a.auth.signOut(), b.auth.signOut(), anonymous.auth.signOut()]);
}
console.log(JSON.stringify(checks));
if (Object.values(checks).some((value) => !value)) process.exit(1);
