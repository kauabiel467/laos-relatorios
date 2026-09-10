import {safeReturn} from "@/lib/auth-return";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
 const returnTo=safeReturn((await searchParams).next);
  if (hasSupabaseEnv()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();

    if (user) {
      redirect(returnTo);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <LoginForm returnTo={returnTo} supabaseReady={hasSupabaseEnv()} />
    </main>
  );
}
