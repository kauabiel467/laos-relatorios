import { NextRequest, NextResponse } from "next/server";
import { fetchMetaDashboardData } from "@/lib/integrations/meta-dashboard";
import type { PeriodKey } from "@/lib/types";

const VALID_PERIODS = new Set<PeriodKey>(["last_7d", "last_30d", "last_90d", "custom"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const periodParam = searchParams.get("period") as PeriodKey | null;
  const period = periodParam && VALID_PERIODS.has(periodParam) ? periodParam : "last_30d";

  if (!accountId) {
    return NextResponse.json({ error: "Informe a conta da Meta para carregar o dashboard." }, { status: 400 });
  }

  try {
    const bundle = await fetchMetaDashboardData(accountId, period);
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Nao foi possivel carregar os dados da Meta."
      },
      { status: 500 }
    );
  }
}
