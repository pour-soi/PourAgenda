import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";

export default function ForgotPasswordPage() {
  return <AuthPage><AuthForm mode="forgot" /></AuthPage>;
}
