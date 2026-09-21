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
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <div className="auth-story-brand">
          <span aria-hidden="true">L</span>
          <strong>laos relatórios</strong>
        </div>
        <div className="auth-story-copy">
          <p>Relatórios de mídia para decisões melhores</p>
          <h2 id="auth-story-title">Da campanha à leitura executiva, sem perder o contexto.</h2>
          <span>
            Centralize projetos, acompanhe o KPI principal e publique análises claras para sua equipe e seus clientes.
          </span>
        </div>
        <div className="auth-story-proof" aria-label="Recursos da plataforma">
          <span><strong>Meta Ads</strong>Integração nativa</span>
          <span><strong>1 fonte</strong>Métricas consistentes</span>
          <span><strong>Tempo real</strong>Leitura operacional</span>
        </div>
      </section>
      <section className="auth-stage" aria-label="Acesso à plataforma">
        <LoginForm returnTo={returnTo} supabaseReady={hasSupabaseEnv()} />
      </section>
    </main>
  );
}
