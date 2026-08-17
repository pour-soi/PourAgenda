import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}
