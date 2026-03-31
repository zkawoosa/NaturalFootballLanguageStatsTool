import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route.ts";

test("POST /api/status-auth/login sets a session cookie and redirects on valid credentials", async () => {
  process.env.NFL_STATUS_USERNAME = "ops";
  process.env.NFL_STATUS_PASSWORD = "goblue";

  const formData = new FormData();
  formData.set("username", "ops");
  formData.set("password", "goblue");
  formData.set("next", "/status");

  const response = await POST(
    new Request("http://localhost/api/status-auth/login", {
      method: "POST",
      body: formData,
    })
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/status");
  assert.match(response.headers.get("set-cookie") ?? "", /nfl_status_session=/);

  delete process.env.NFL_STATUS_USERNAME;
  delete process.env.NFL_STATUS_PASSWORD;
});

test("POST /api/status-auth/login rejects invalid credentials", async () => {
  process.env.NFL_STATUS_USERNAME = "ops";
  process.env.NFL_STATUS_PASSWORD = "goblue";

  const formData = new FormData();
  formData.set("username", "ops");
  formData.set("password", "wrong");
  formData.set("next", "/status");

  const response = await POST(
    new Request("http://localhost/api/status-auth/login", {
      method: "POST",
      body: formData,
    })
  );

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/status/login?error=invalid&next=%2Fstatus"
  );

  delete process.env.NFL_STATUS_USERNAME;
  delete process.env.NFL_STATUS_PASSWORD;
});
