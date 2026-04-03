import { NextResponse } from "next/server.js";

import {
  STATUS_LOGIN_PATH,
  STATUS_PAGE_PATH,
  hasValidStatusSession,
  readStatusSessionFromCookieHeader,
} from "@/lib/app/statusAuth.ts";
import { markQueryReportResolved } from "@/lib/db/queryReports.ts";

function redirectTo(request: Request, target: string) {
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}

export async function POST(request: Request) {
  const session = readStatusSessionFromCookieHeader(request.headers.get("cookie"));
  if (!hasValidStatusSession(session)) {
    return redirectTo(
      request,
      `${STATUS_LOGIN_PATH}?error=unauthorized&next=${encodeURIComponent(STATUS_PAGE_PATH)}`
    );
  }

  const formData = await request.formData();
  const idValue = String(formData.get("id") ?? "");
  const id = Number.parseInt(idValue, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return redirectTo(request, `${STATUS_PAGE_PATH}?report=invalid`);
  }

  markQueryReportResolved(id);
  return redirectTo(request, `${STATUS_PAGE_PATH}?report=resolved`);
}
