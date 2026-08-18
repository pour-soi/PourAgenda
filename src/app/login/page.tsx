import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";

import { safeInternalPath } from "@/lib/notification-deep-link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthPage><AuthForm mode="login" nextPath={safeInternalPath(next)} /></AuthPage>;
}
