import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const filePairs = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);
const testFilePairs = fs.existsSync(".env.rls-test")
  ? Object.fromEntries(
      fs.readFileSync(".env.rls-test", "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
    )
  : {};
const credentials = { ...testFilePairs, ...process.env };
const required = [
  "POURAGENDA_TEST_USER_A_EMAIL", "POURAGENDA_TEST_USER_A_PASSWORD",
  "POURAGENDA_TEST_USER_B_EMAIL", "POURAGENDA_TEST_USER_B_PASSWORD",
];
if (required.some((name) => !credentials[name])) {
  console.error("Two confirmed Phase 1 test accounts are required in process environment variables.");
  process.exit(2);
}

const makeClient = () => createClient(
  filePairs.NEXT_PUBLIC_SUPABASE_URL,
  filePairs.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const a = makeClient();
const b = makeClient();
const anonymous = makeClient();
const privateTables = [
  "profiles",
  "user_settings",
  "categories",
  "contacts",
  "appointments",
  "appointment_shares",
  "appointment_activity",
];
const login = async (client, emailName, passwordName) => {
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials[emailName],
    password: credentials[passwordName],
  });
  if (error || !data.user) throw new Error(`Unable to authenticate ${emailName}.`);
  return data.user.id;
};
let createdId;
let injectionName;
const checks = {
  owner_create: false,
  owner_read: false,
  owner_update: false,
  owner_delete: false,
  cross_user_read_blocked: false,
  cross_user_update_blocked: false,
  cross_user_delete_blocked: false,
  foreign_user_id_injection_blocked: false,
  anonymous_private_table_access_denied: false,
  temporary_data_removed: false,
};
try {
  const aId = await login(a, "POURAGENDA_TEST_USER_A_EMAIL", "POURAGENDA_TEST_USER_A_PASSWORD");
  const bId = await login(b, "POURAGENDA_TEST_USER_B_EMAIL", "POURAGENDA_TEST_USER_B_PASSWORD");
  const name = `RLS verification ${randomUUID()}`;
  const created = await a.from("categories").insert({ user_id: aId, name, color: "#667168" }).select("id").single();
  if (created.error) throw new Error("User A could not create an owned category.");
  createdId = created.data.id;
  checks.owner_create = true;

  const ownRead = await a.from("categories").select("id").eq("id", createdId);
  checks.owner_read = !ownRead.error && ownRead.data?.length === 1;

  const ownUpdate = await a
    .from("categories")
    .update({ name: `${name} updated` })
    .eq("id", createdId)
    .select("id, name");
  checks.owner_update = (
    !ownUpdate.error
    && ownUpdate.data?.length === 1
    && ownUpdate.data[0].name === `${name} updated`
  );

  const crossRead = await b.from("categories").select("id").eq("id", createdId);
  checks.cross_user_read_blocked = !crossRead.error && crossRead.data?.length === 0;

  const crossUpdate = await b.from("categories").update({ name: "Cross-user write" }).eq("id", createdId).select("id");
  checks.cross_user_update_blocked = !crossUpdate.error && crossUpdate.data?.length === 0;

  const crossDelete = await b.from("categories").delete().eq("id", createdId).select("id");
  const afterCrossDelete = await a.from("categories").select("id").eq("id", createdId);
  checks.cross_user_delete_blocked = (
    !crossDelete.error
    && crossDelete.data?.length === 0
    && !afterCrossDelete.error
    && afterCrossDelete.data?.length === 1
  );

  injectionName = `RLS injection ${randomUUID()}`;
  const injection = await b.from("categories").insert({
    user_id: aId,
    name: injectionName,
    color: "#667168",
  });
  const injectedRead = await a.from("categories").select("id").eq("name", injectionName);
  checks.foreign_user_id_injection_blocked = (
    aId !== bId
    && Boolean(injection.error)
    && !injectedRead.error
    && injectedRead.data?.length === 0
  );

  const anonymousReads = await Promise.all(
    privateTables.map((table) => anonymous.from(table).select("*").limit(1)),
  );
  checks.anonymous_private_table_access_denied = anonymousReads.every(({ error }) => Boolean(error));
} finally {
  let injectedDataRemoved = true;
  if (injectionName) {
    const injectedCleanup = await a.from("categories").delete().eq("name", injectionName);
    const injectedAfterCleanup = await a.from("categories").select("id").eq("name", injectionName);
    injectedDataRemoved = (
      !injectedCleanup.error
      && !injectedAfterCleanup.error
      && injectedAfterCleanup.data?.length === 0
    );
  }

  if (createdId) {
    const cleanup = await a.from("categories").delete().eq("id", createdId);
    const afterCleanup = await a.from("categories").select("id").eq("id", createdId);
    checks.owner_delete = (
      !cleanup.error
      && !afterCleanup.error
      && afterCleanup.data?.length === 0
    );
  }
  checks.temporary_data_removed = checks.owner_delete && injectedDataRemoved;
  await Promise.all([a.auth.signOut(), b.auth.signOut(), anonymous.auth.signOut()]);
}

console.log(JSON.stringify(checks));
if (Object.values(checks).some((passed) => !passed)) process.exit(1);
