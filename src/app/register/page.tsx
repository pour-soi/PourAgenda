import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";

export default function RegisterPage() {
  return <AuthPage><AuthForm mode="register" /></AuthPage>;
}
