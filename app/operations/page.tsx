export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AgencyWorkspace } from "@/components/agency/workspace";
export default async function OperationsPage() {
 const db = await getSupabaseServerClient();
 if (!db || !(await db.auth.getUser()).data.user) redirect("/login?next=%2Foperations");
 return <Suspense fallback={<main>Carregando…</main>}><AgencyWorkspace /></Suspense>;
}
