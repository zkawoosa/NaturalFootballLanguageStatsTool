import { NextResponse } from "next/server";

import { createCanonicalStatsService } from "@/lib/app/canonicalServiceFactory.ts";
import { getTeamsResponse } from "@/lib/app/teamsService.ts";

export async function GET() {
  const response = await getTeamsResponse(createCanonicalStatsService());
  return NextResponse.json(response, { status: response.error ? 503 : 200 });
}
