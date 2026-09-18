import { redirect } from "next/navigation";
import { legacyRootHref } from "@/lib/projects/routes";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyRootHref(await searchParams));
}
