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
    <main className="auth-shell workspace-auth-shell">
      <section className="auth-story" aria-labelledby="workspace-story-title">
        <div className="auth-story-brand">
          <span aria-hidden="true">L</span>
          <strong>laos relatórios</strong>
        </div>
        <div className="auth-story-copy">
          <p>Configuração inicial</p>
          <h2 id="workspace-story-title">Organize a operação antes do primeiro relatório.</h2>
          <span>
            Crie o workspace, defina quem participa e comece cada projeto com responsabilidades claras.
          </span>
        </div>
      </section>
      <section className="auth-stage workspace-stage" aria-label="Criação do workspace">
        <NewWorkspaceFlow />
      </section>
    </main>
  );
}
