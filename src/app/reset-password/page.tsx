import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/forgot-password");
  return <AuthPage><AuthForm mode="reset" /></AuthPage>;
}
