import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const pairs = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const client = createClient(
  pairs.NEXT_PUBLIC_SUPABASE_URL,
  pairs.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const checks = [
  ["profiles", "user_id"],
  ["user_settings", "user_id"],
  ["categories", "id"],
  ["contacts", "id"],
  ["appointments", "id"],
  ["appointment_shares", "id"],
  ["appointment_activity", "id"],
];

const results = {};
for (const [table, column] of checks) {
  const { error } = await client.from(table).select(column).limit(1);
  results[table] = !error
    ? "reachable"
    : error.code === "PGRST205"
      ? "table_not_found"
      : error.code === "PGRST301"
        ? "jwt_error"
        : error.code === "42501"
          ? "permission_denied"
          : `other_error_${error.status ?? 0}`;
}

console.log(JSON.stringify(results));
