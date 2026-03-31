import { NextResponse } from "next/server.js";

import {
  createStatusSessionValue,
  isStatusAuthConfigured,
  resolveStatusNextPath,
  STATUS_LOGIN_PATH,
  STATUS_SESSION_COOKIE_NAME,
  validateStatusCredentials,
} from "../../../../lib/app/statusAuth.ts";

function buildRedirectUrl(requestUrl: string, error: string, nextPath: string): URL {
  const url = new URL(STATUS_LOGIN_PATH, requestUrl);
  url.searchParams.set("error", error);
  url.searchParams.set("next", nextPath);
  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const username = typeof rawUsername === "string" ? rawUsername : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const nextPath = resolveStatusNextPath(formData.get("next"));

  if (!isStatusAuthConfigured()) {
    return NextResponse.redirect(buildRedirectUrl(request.url, "disabled", nextPath), 303);
  }

  if (!validateStatusCredentials(username, password)) {
    return NextResponse.redirect(buildRedirectUrl(request.url, "invalid", nextPath), 303);
  }

  const sessionValue = createStatusSessionValue();
  if (!sessionValue) {
    return NextResponse.redirect(buildRedirectUrl(request.url, "disabled", nextPath), 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set({
    name: STATUS_SESSION_COOKIE_NAME,
    value: sessionValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
