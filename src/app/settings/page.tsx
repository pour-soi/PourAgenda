import { redirect } from "next/navigation";
import { SettingsManager } from "@/components/settings-manager";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : "";
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : "";
  if (!userId) redirect("/login");

  const [profile, settings, categories] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", userId).single(),
    supabase.from("user_settings").select("*").eq("user_id", userId).single(),
    supabase.from("categories").select("id,name,color,hidden").eq("user_id", userId).order("name"),
  ]);
  const error = profile.error ?? settings.error ?? categories.error;
  if (error || !profile.data || !settings.data) {
    throw new Error("PourAgenda could not load your private settings. Confirm the Phase 1 grants migration is applied.");
  }

  return <SettingsManager
    userId={userId}
    email={email}
    initialName={profile.data.display_name ?? ""}
    initialSettings={settings.data}
    initialCategories={categories.data ?? []}
  />;
}
