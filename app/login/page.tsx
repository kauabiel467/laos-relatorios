import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  if (hasSupabaseEnv()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();

    if (user) {
      redirect("/");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <LoginForm supabaseReady={hasSupabaseEnv()} />
    </main>
  );
}
