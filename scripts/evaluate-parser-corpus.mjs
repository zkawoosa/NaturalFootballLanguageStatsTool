import fs from "node:fs";

process.env.NFL_QUERY_TEST_QUIET_LOGS = "1";

const { parseNflQuery } = await import("../src/lib/parser/nlpParser.ts");

const corpusPath = process.argv[2] ?? "data/samples_combined.jsonl";

function loadSamples(path) {
  return fs
    .readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((record) => record.recordType === "sample");
}

function toLegacyState(parsed) {
  if (parsed.resolution === "answer") return "success";
  if (parsed.resolution === "clarify") return "clarification";
  return "error";
}

function compareSample(sample) {
  const parsed = parseNflQuery(sample.query);
  const mismatches = [];

  const actual = {
    intent: parsed.intent,
    scopeType: parsed.slots.scopeType ?? null,
    sort: parsed.slots.sort ?? null,
    state: toLegacyState(parsed),
    resolution: parsed.resolution,
  };

  if (sample.intent !== actual.intent) {
    mismatches.push({
      bucket: "intent",
      expected: sample.intent,
      actual: actual.intent,
    });
  }

  const expectedScopeType = sample.slots?.scopeType ?? null;
  if (expectedScopeType !== actual.scopeType) {
    mismatches.push({
      bucket: "scopeType",
      expected: expectedScopeType,
      actual: actual.scopeType,
    });
  }

  const expectedSort = sample.slots?.sort ?? null;
  if (expectedSort !== actual.sort) {
    mismatches.push({
      bucket: "sort",
      expected: expectedSort,
      actual: actual.sort,
    });
  }

  if (sample.expectedState !== actual.state) {
    mismatches.push({
      bucket: "state",
      expected: sample.expectedState,
      actual: actual.state,
      resolution: actual.resolution,
    });
  }

  return mismatches.map((mismatch) => ({
    id: sample.id,
    query: sample.query,
    ...mismatch,
  }));
}

function summarize(mismatches) {
  const buckets = new Map();

  for (const mismatch of mismatches) {
    const key = `${mismatch.bucket}:${String(mismatch.expected)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count || a.bucket.localeCompare(b.bucket));
}

const samples = loadSamples(corpusPath);
const mismatches = samples.flatMap(compareSample);
const summary = summarize(mismatches);

console.log(JSON.stringify(
  {
    corpusPath,
    sampleCount: samples.length,
    mismatchCount: mismatches.length,
    buckets: summary,
    mismatches,
  },
  null,
  2
));
