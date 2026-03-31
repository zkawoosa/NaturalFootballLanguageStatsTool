import { NextResponse } from "next/server.js";

import {
  resolveStatusNextPath,
  STATUS_LOGIN_PATH,
  STATUS_SESSION_COOKIE_NAME,
} from "../../../../lib/app/statusAuth.ts";

export async function POST(request: Request) {
  const formData = await request.formData();
  const nextPath = resolveStatusNextPath(formData.get("next") ?? STATUS_LOGIN_PATH);
  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set({
    name: STATUS_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
