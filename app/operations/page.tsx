import { redirect } from "next/navigation";
import { legacyOperationsHref } from "@/lib/projects/routes";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyOperationsHref(await searchParams));
}
