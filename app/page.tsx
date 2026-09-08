export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AgencyWorkspace } from "@/components/agency/workspace";
export default async function HomePage() {
  const db = await getSupabaseServerClient();
  if (!db) redirect("/login");
  if (db) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) redirect("/login");
  }
  return (
    <Suspense
      fallback={
        <main className="agency-loading">Carregando sua área de trabalho…</main>
      }
    >
      <AgencyWorkspace />
    </Suspense>
  );
}
