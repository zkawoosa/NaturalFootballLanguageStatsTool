import { NextResponse } from "next/server.js";

import {
  STATUS_LOGIN_PATH,
  STATUS_PAGE_PATH,
  hasValidStatusSession,
  readStatusSessionFromCookieHeader,
} from "@/lib/app/statusAuth.ts";
import { activateSnapshotVersion } from "@/lib/db/snapshotVersions.ts";

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
  const version = String(formData.get("version") ?? "").trim();
  if (!version) {
    return redirectTo(request, `${STATUS_PAGE_PATH}?snapshot=invalid`);
  }

  try {
    activateSnapshotVersion(version);
    return redirectTo(request, `${STATUS_PAGE_PATH}?snapshot=activated`);
  } catch {
    return redirectTo(request, `${STATUS_PAGE_PATH}?snapshot=failed`);
  }
}
