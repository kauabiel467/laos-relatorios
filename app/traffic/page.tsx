import { redirect } from "next/navigation";
import { projectHref } from "@/lib/projects/routes";

export default async function LegacyTrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const projectId = typeof params.project === "string" ? params.project : typeof params.client === "string" ? params.client : "";
  redirect(projectId ? projectHref(projectId, "dashboards") : "/projects");
}
