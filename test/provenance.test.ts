import { test } from "node:test";
import assert from "node:assert/strict";

import { findAiDeclarations } from "../src/parser/provenance.ts";
import { parseHeaderBlock } from "../src/parser/headers.ts";
import { buildTimeline } from "../src/parser/received.ts";
import { textReport } from "../src/render/report.ts";

const headers = (raw: string) => parseHeaderBlock(raw);

test("finds the header MCP servers add", () => {
  const found = findAiDeclarations(headers("X-AI-Generated: mcp-office365\nSubject: hi"));

  assert.deepEqual(found, [{ name: "X-AI-Generated", value: "mcp-office365" }]);
});

test("matches the header family regardless of case or exact spelling", () => {
  const found = findAiDeclarations(
    headers(
      [
        "x-ai-generated: true",
        "X-AI-Assisted: copilot",
        "AI-Generated: yes",
        "X-Mailer-AI-Generated: draft-bot",
      ].join("\n")
    )
  );

  assert.equal(found.length, 4);
});

test("ignores headers that merely mention AI or deny the claim", () => {
  const found = findAiDeclarations(
    headers(
      [
        "X-AI-Generated: false",
        "X-AI-Generated: no",
        "X-Mailer: Microsoft Outlook",
        "X-MS-Exchange-Organization-AuthAs: Internal",
        "Subject: our new AI-generated report",
        "X-Maintained-By: ops",
      ].join("\n")
    )
  );

  assert.deepEqual(found, []);
});

test("carries declarations through the timeline and into the report", () => {
  const timeline = buildTimeline(`Received: from a.example.com by b.example.com with ESMTP id 1;
 Thu, 4 Sep 2026 10:00:00 +0000
X-AI-Generated: mcp-office365
Subject: status update`);

  assert.equal(timeline.aiDeclarations.length, 1);
  assert.match(textReport(timeline), /AI-generated \(sender-declared\): X-AI-Generated: mcp-office365/);
});

test("reports nothing for ordinary mail", () => {
  const timeline = buildTimeline(`Received: from a.example.com by b.example.com with ESMTP id 1;
 Thu, 4 Sep 2026 10:00:00 +0000
Subject: status update`);

  assert.deepEqual(timeline.aiDeclarations, []);
  assert.doesNotMatch(textReport(timeline), /AI-generated/);
});
