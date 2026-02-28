import { NextResponse } from "next/server";

import { getSourceHealth } from "@/lib/app/appShellService.ts";
import { createDataSource } from "@/lib/app/sourceFactory.ts";

export async function GET() {
  const source = createDataSource();
  const status = await getSourceHealth(source);
  return NextResponse.json(status, { status: status.healthy ? 200 : 503 });
}
