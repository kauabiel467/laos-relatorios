import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardApp } from "@/components/dashboard/dashboard-app";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";

export default async function HomePage() {
  let requiresWorkspaceSetup = false;

  if (hasSupabaseEnv()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const teamContext = await getTeamContext();
    if (!teamContext.team) {
      requiresWorkspaceSetup = true;
    }
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <DashboardApp requiresWorkspaceSetup={requiresWorkspaceSetup} />
    </Suspense>
  );
}
