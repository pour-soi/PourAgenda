import { redirect } from "next/navigation";
import { ContactsManager } from "@/components/contacts-manager";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_PAGE_SIZE } from "@/lib/contacts";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : "";
  if (!userId) redirect("/login");

  const result = await supabase.from("contacts").select("*")
    .eq("user_id", userId).order("name").order("id").limit(CONTACT_PAGE_SIZE + 1);
  if (result.error) throw new Error("PourAgenda could not load your contacts.");
  return <ContactsManager userId={userId} initialRows={result.data ?? []} />;
}
