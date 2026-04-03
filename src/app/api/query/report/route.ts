import { NextResponse } from "next/server.js";

import { explainQueryRequest } from "@/lib/app/queryExplain.ts";
import { appendQueryReport } from "@/lib/db/queryReports.ts";
import { getActiveSnapshotVersion } from "@/lib/db/snapshotVersions.ts";

type QueryReportRequestBody = {
  query?: unknown;
  requestBody?: unknown;
  response?: unknown;
  note?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: QueryReportRequestBody;

  try {
    body = (await request.json()) as QueryReportRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { error: "Field 'query' must be a non-empty string." },
      { status: 400 }
    );
  }

  const requestBody = isRecord(body.requestBody) ? body.requestBody : { query };
  const responsePayload = isRecord(body.response) ? body.response : {};
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, 1000)
      : null;
  const context =
    isRecord(requestBody.context) && !Array.isArray(requestBody.context)
      ? (requestBody.context as {
          season?: number;
          week?: number;
          team?: string;
          player?: string;
          stat?: string;
        })
      : undefined;
  const explain = explainQueryRequest(query, context);
  const activeSnapshot = getActiveSnapshotVersion();
  const reportId = appendQueryReport({
    query,
    requestBody,
    responsePayload,
    parserTrace: explain as unknown as Record<string, unknown>,
    reportNote: note,
    snapshotVersion: activeSnapshot?.version ?? null,
    snapshotBuiltAt: activeSnapshot?.builtAt ?? null,
  });

  return NextResponse.json({ ok: true, reportId }, { status: 201 });
}
