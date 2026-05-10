import { redirect } from "next/navigation";
import { NewWorkspaceFlow } from "@/components/workspace/new-workspace-flow";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";

export default async function NewWorkspacePage() {
  if (!hasSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase!.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const teamContext = await getTeamContext();
  if (teamContext.team) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <NewWorkspaceFlow />
    </main>
  );
}
