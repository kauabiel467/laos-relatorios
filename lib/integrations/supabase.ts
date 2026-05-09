import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";

export async function getSupabaseClient() {
  return getSupabaseServerClient();
}

export function getSupabaseServiceClient() {
  return getSupabaseAdminClient();
}
