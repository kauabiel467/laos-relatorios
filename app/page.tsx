export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ProjectsWorkspace } from "@/components/projects/workspace";
export default async function HomePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams; const query=new URLSearchParams(); for(const key of ["project","document","view","preview","create"])if(typeof params[key]==="string")query.set(key,params[key] as string);
  const login="/login?next="+encodeURIComponent("/?"+query.toString());
  const db = await getSupabaseServerClient();
  if (!db) redirect(login);
  if (db) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) redirect(login);
  }
  return (
    <Suspense
      fallback={
        <main className="agency-loading">Carregando sua área de trabalho…</main>
      }
    >
      <ProjectsWorkspace />
    </Suspense>
  );
}
