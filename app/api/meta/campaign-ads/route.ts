import { NextRequest, NextResponse } from "next/server";
import { fetchMetaCampaignAds } from "@/lib/integrations/meta-dashboard";
import type { PeriodKey } from "@/lib/types";

const VALID_PERIODS = new Set<PeriodKey>(["last_7d", "last_30d", "last_90d", "custom"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const campaignId = searchParams.get("campaignId");
  const periodParam = searchParams.get("period") as PeriodKey | null;
  const period = periodParam && VALID_PERIODS.has(periodParam) ? periodParam : "last_30d";

  if (!campaignId) {
    return NextResponse.json({ error: "Informe a campanha da Meta para carregar os anuncios." }, { status: 400 });
  }

  try {
    const ads = await fetchMetaCampaignAds(campaignId, period);
    return NextResponse.json({ ads });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Nao foi possivel carregar os anuncios da campanha."
      },
      { status: 500 }
    );
  }
}
