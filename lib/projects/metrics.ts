import type { MetricValues } from "./model";
type Action = { action_type: string; value: string };
export interface Row {
  [key: string]: unknown;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Action[];
  action_values?: Action[];
}
const n = (x: unknown) => Number(x) || 0;
const action = (a: Action[] | undefined, keys: string[]) => {
  for (const k of keys) {
    const v = a?.find((x) => x.action_type === k);
    if (v) return n(v.value);
  }
  return 0;
};
export function metrics(r: Row | undefined): MetricValues {
  const spend = n(r?.spend),
    impressions = n(r?.impressions),
    reach = n(r?.reach),
    clicks = n(r?.clicks),
    links = action(r?.actions, ["link_click"]),
    purchases = action(r?.actions, ["offsite_conversion.fb_pixel_purchase"]),
    revenue = action(r?.action_values, [
      "offsite_conversion.fb_pixel_purchase",
    ]),
    messages = action(r?.actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_conversation_started",
    ]),
    leads = action(r?.actions, [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
    ]);
  const divide = (a: number, b: number) => (b ? a / b : null);
  return {
    spend,
    impressions,
    reach,
    clicks,
    link_clicks: links,
    ctr: impressions ? (links / impressions) * 100 : null,
    cpc: divide(spend, links),
    cpm: impressions ? (spend / impressions) * 1000 : null,
    frequency: divide(impressions, reach),
    purchases,
    revenue,
    roas: divide(revenue, spend),
    cpa: divide(spend, purchases),
    messages,
    cost_message: divide(spend, messages),
    leads,
    cpl: divide(spend, leads),
    landing_views: action(r?.actions, ["landing_page_view"]),
    checkouts: action(r?.actions, [
      "offsite_conversion.fb_pixel_initiate_checkout",
    ]),
  };
}
