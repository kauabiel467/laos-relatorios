export type MetaAction = { action_type: string; value: string | number };

// Aliases are ordered by canonical priority. readMetaEvent selects the first
// available alias instead of summing equivalent events and double-counting a conversion.
export const META_EVENT_TAXONOMY = {
  link_clicks: ["link_click", "outbound_click"],
  purchases: [
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
    "onsite_conversion.purchase",
  ],
  revenue: [
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
    "onsite_conversion.purchase",
  ],
  messages: [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started",
    "messaging_conversation_started",
  ],
  leads: [
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
  ],
  landing_views: ["landing_page_view"],
  checkouts: [
    "offsite_conversion.fb_pixel_initiate_checkout",
    "initiate_checkout",
    "omni_initiated_checkout",
  ],
  profile_visits: [
    "profile_visit",
    "profile_visits",
    "instagram_profile_visit",
    "ig_profile_visit",
    "ig_profile_visits",
  ],
  followers: [
    "follow",
    "follows",
    "instagram_follow",
    "ig_follow",
    "page_like",
    "like",
  ],
  engagements: ["post_engagement", "page_engagement"],
} as const;

export type MetaEventMetric = keyof typeof META_EVENT_TAXONOMY;

export function readMetaEvent(
  actions: MetaAction[] | undefined,
  metric: MetaEventMetric,
): number | null {
  if (!actions) return null;
  for (const actionType of META_EVENT_TAXONOMY[metric]) {
    const action = actions.find((item) => item.action_type === actionType);
    if (action) {
      const value = Number(action.value);
      return Number.isFinite(value) ? value : null;
    }
  }
  return 0;
}
