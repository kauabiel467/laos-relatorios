// Compatibility endpoint only. All workspace and document rules live in the
// canonical projects handler; no legacy collection or report creation remains.
export const maxDuration = 60;
export { GET, POST } from "@/app/api/projects/route";
