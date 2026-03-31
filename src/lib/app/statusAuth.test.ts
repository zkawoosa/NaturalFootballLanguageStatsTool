import assert from "node:assert/strict";
import test from "node:test";

import {
  createStatusSessionValue,
  getStatusLoginErrorMessage,
  hasValidStatusSession,
  isStatusAuthConfigured,
  readStatusSessionFromCookieHeader,
  resolveStatusNextPath,
  resolveStatusUsername,
  validateStatusCredentials,
} from "./statusAuth.ts";

const ENV = {
  NFL_STATUS_USERNAME: "ops",
  NFL_STATUS_PASSWORD: "goblue",
} as NodeJS.ProcessEnv;

test("status auth helpers validate configured credentials and session values", () => {
  assert.equal(isStatusAuthConfigured(ENV), true);
  assert.equal(resolveStatusUsername(ENV), "ops");
  assert.equal(validateStatusCredentials("ops", "goblue", ENV), true);
  assert.equal(validateStatusCredentials("ops", "wrong", ENV), false);

  const session = createStatusSessionValue(ENV);
  assert.equal(typeof session, "string");
  assert.equal(hasValidStatusSession(session, ENV), true);
  assert.equal(hasValidStatusSession("bad-session", ENV), false);
});

test("status auth helpers normalize next paths and cookie headers", () => {
  assert.equal(resolveStatusNextPath("/status"), "/status");
  assert.equal(resolveStatusNextPath("https://example.com"), "/status");
  assert.equal(
    readStatusSessionFromCookieHeader("other=1; nfl_status_session=abc123; theme=dark"),
    "abc123"
  );
});

test("status auth helpers map login error codes to user-facing messages", () => {
  assert.equal(getStatusLoginErrorMessage("invalid"), "Incorrect username or password.");
  assert.equal(
    getStatusLoginErrorMessage("disabled"),
    "Status access is not configured. Set NFL_STATUS_USERNAME and NFL_STATUS_PASSWORD."
  );
  assert.equal(getStatusLoginErrorMessage("unknown"), null);
});
