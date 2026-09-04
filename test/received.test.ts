import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTimeline, parseReceived } from "../src/parser/received.ts";
import { parseHeaderBlock, stripComments, unfold } from "../src/parser/headers.ts";
import { parseRfc5322Date } from "../src/parser/date.ts";

/**
 * A Gmail sender to an Exchange Online mailbox, folded exactly the way Outlook
 * returns it. The interesting part is the 4m22s gap between Google handing the
 * message off and Microsoft's edge accepting it.
 */
const GMAIL_TO_EXCHANGE = `Received: from BN8PR12MB3456.namprd12.prod.outlook.com (2603:10b6:408:6c::13)
 by DM6PR12MB4567.namprd12.prod.outlook.com with HTTPS; Thu, 4 Sep 2026
 16:50:12 +0000
Received: from MW4PR03CA0123.namprd03.prod.outlook.com (2603:10b6:303:b4::8) by
 BN8PR12MB3456.namprd12.prod.outlook.com (2603:10b6:408:6c::13) with Microsoft
 SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id
 15.20.6792.29; Thu, 4 Sep 2026 16:50:10 +0000
Received: from mail-wr1-f54.google.com (209.85.221.54) by
 MW4PR03CA0123.outlook.office365.com (10.174.208.35) with Microsoft SMTP Server
 (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) id
 15.20.6792.29 via Frontend Transport; Thu, 4 Sep 2026 16:49:52 +0000
Received: by mail-wr1-f54.google.com with SMTP id abc123so456789wrx.11
        for <duane@example.com>; Thu, 04 Sep 2026 09:45:30 -0700 (PDT)
Date: Thu, 4 Sep 2026 09:45:28 -0700
From: Alice Example <alice@gmail.com>
To: duane@example.com
Subject: Quarterly numbers
Message-ID: <CAF=abc123@mail.gmail.com>
X-MS-Exchange-Transport-EndToEndLatency: 00:04:42.1093750`;

test("orders hops chronologically, oldest first", () => {
  const timeline = buildTimeline(GMAIL_TO_EXCHANGE);

  assert.equal(timeline.hops.length, 4);
  assert.equal(timeline.hops[0]!.received.by, "mail-wr1-f54.google.com");
  assert.equal(timeline.hops[3]!.received.by, "DM6PR12MB4567.namprd12.prod.outlook.com");
});

test("measures the delay into each hop", () => {
  const { hops } = buildTimeline(GMAIL_TO_EXCHANGE);

  // The first hop has nothing before it to measure against.
  assert.equal(hops[0]!.delaySeconds, null);
  assert.equal(hops[1]!.delaySeconds, 262); // 16:45:30Z -> 16:49:52Z
  assert.equal(hops[2]!.delaySeconds, 18);
  assert.equal(hops[3]!.delaySeconds, 2);
});

test("totals transit time across the whole chain", () => {
  const timeline = buildTimeline(GMAIL_TO_EXCHANGE);

  assert.equal(timeline.totalSeconds, 282);
  assert.equal(timeline.slowest?.position, 2);
  assert.equal(timeline.exchangeLatencySeconds, 282.109375);
});

test("pulls connection details out of the parenthesised comment", () => {
  const { hops } = buildTimeline(GMAIL_TO_EXCHANGE);
  const edge = hops[1]!.received;

  assert.equal(edge.from, "mail-wr1-f54.google.com");
  assert.equal(edge.fromIp, "209.85.221.54");
  assert.equal(edge.with, "Microsoft SMTP Server");
  assert.equal(edge.tlsVersion, "TLS1_2");
  assert.equal(edge.cipher, "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256");
});

test("reads envelope recipient and queue id", () => {
  const { hops } = buildTimeline(GMAIL_TO_EXCHANGE);

  assert.equal(hops[0]!.received.for, "duane@example.com");
  assert.equal(hops[0]!.received.id, "abc123so456789wrx.11");
  assert.equal(hops[0]!.received.with, "SMTP");
});

test("carries message identity through to the summary", () => {
  const timeline = buildTimeline(GMAIL_TO_EXCHANGE);

  assert.equal(timeline.subject, "Quarterly numbers");
  assert.equal(timeline.from, "Alice Example <alice@gmail.com>");
  assert.equal(timeline.messageId, "<CAF=abc123@mail.gmail.com>");
  assert.equal(timeline.sentAt?.toISOString(), "2026-09-04T16:45:28.000Z");
});

test("a hostname beginning with a keyword is not read as a clause", () => {
  const header = parseReceived(
    "from forward.example.com (forward.example.com [10.0.0.1]) by mx.example.net " +
      "with ESMTP id 4XyZ; Thu, 4 Sep 2026 10:00:00 +0000",
    0
  );

  assert.equal(header.from, "forward.example.com");
  assert.equal(header.fromReverseDns, "forward.example.com");
  assert.equal(header.fromIp, "10.0.0.1");
  assert.equal(header.by, "mx.example.net");
  assert.equal(header.for, undefined);
});

test("identifies MTA software but not a bare relay IP", () => {
  const postfix = parseReceived(
    "from client.example.org (client.example.org [198.51.100.7]) " +
      "by mx.example.net (Postfix) with ESMTPS id 4Abc; Thu, 4 Sep 2026 10:00:00 +0000",
    0
  );
  assert.equal(postfix.bySoftware, "Postfix");

  const exchange = parseReceived(
    "from a.example.com (10.1.1.1) by b.example.com (10.1.1.2) " +
      "with Microsoft SMTP Server id 15.20; Thu, 4 Sep 2026 10:00:00 +0000",
    0
  );
  assert.equal(exchange.bySoftware, undefined);
});

test("treats a backwards clock as zero delay and says so", () => {
  const skewed = `Received: from b.example.com by c.example.com; Thu, 4 Sep 2026 10:00:30 +0000
Received: from a.example.com by b.example.com; Thu, 4 Sep 2026 10:00:45 +0000`;

  const { hops, warnings } = buildTimeline(skewed);

  assert.equal(hops[1]!.clockSkew, true);
  assert.equal(hops[1]!.delaySeconds, 0);
  assert.match(warnings.join(" "), /clock disagrees/);
});

test("keeps an undated hop on the timeline", () => {
  const undated = `Received: from b.example.com by c.example.com; Thu, 4 Sep 2026 10:00:30 +0000
Received: from a.example.com by b.example.com with ESMTP id 4Xy`;

  const { hops, warnings } = buildTimeline(undated);

  assert.equal(hops.length, 2);
  assert.equal(hops[0]!.received.timestamp, undefined);
  assert.equal(hops[1]!.delaySeconds, null);
  assert.match(warnings.join(" "), /no readable timestamp/);
});

test("reports a message that never picked up Received headers", () => {
  const { hops, warnings } = buildTimeline("Subject: internal only\nFrom: a@example.com");

  assert.equal(hops.length, 0);
  assert.match(warnings.join(" "), /No Received headers/);
});

test("unfolds continuation lines into one value", () => {
  const headers = parseHeaderBlock("Subject: a very\n long subject\nTo: x@example.com");

  assert.equal(headers.length, 2);
  assert.equal(headers[0]!.value, "a very long subject");
});

test("unfold handles CRLF as well as bare LF", () => {
  assert.equal(unfold("A: one\r\n\ttwo"), "A: one two");
});

test("strips nested comments but leaves quoted parentheses alone", () => {
  assert.equal(stripComments("a (b (c) d) e").trim().replace(/\s+/g, " "), "a e");
  assert.equal(stripComments('"a (b)" c'), '"a (b)" c');
});

test("parses obsolete alphabetic zones", () => {
  assert.equal(
    parseRfc5322Date("Thu, 4 Sep 2026 09:45:30 PDT")?.toISOString(),
    "2026-09-04T16:45:30.000Z"
  );
  assert.equal(
    parseRfc5322Date("4 Sep 2026 09:45:30 GMT")?.toISOString(),
    "2026-09-04T09:45:30.000Z"
  );
});

test("applies the two-digit year rule", () => {
  assert.equal(parseRfc5322Date("1 Jan 26 00:00:00 +0000")?.getUTCFullYear(), 2026);
  assert.equal(parseRfc5322Date("1 Jan 98 00:00:00 +0000")?.getUTCFullYear(), 1998);
});

test("rejects a date that does not exist rather than rolling it over", () => {
  assert.equal(parseRfc5322Date("31 Apr 2026 10:00:00 +0000"), null);
  assert.equal(parseRfc5322Date("not a date"), null);
});

test("accepts a missing seconds field", () => {
  assert.equal(
    parseRfc5322Date("Thu, 4 Sep 2026 09:45 +0000")?.toISOString(),
    "2026-09-04T09:45:00.000Z"
  );
});

test("does not mistake an address literal for a reverse-DNS name", () => {
  const ipv6 = parseReceived(
    "from MW4PR03CA0123.namprd03.prod.outlook.com (2603:10b6:303:b4::8) " +
      "by BN8PR12MB3456.namprd12.prod.outlook.com with Microsoft SMTP Server " +
      "id 15.20; Thu, 4 Sep 2026 16:50:10 +0000",
    0
  );
  assert.equal(ipv6.from, "MW4PR03CA0123.namprd03.prod.outlook.com");
  assert.equal(ipv6.fromIp, "2603:10b6:303:b4::8");
  assert.equal(ipv6.fromReverseDns, undefined);

  const ipv4 = parseReceived(
    "from relay.example.com (198.51.100.7) by mx.example.net " +
      "with ESMTP id 4Ab; Thu, 4 Sep 2026 10:00:00 +0000",
    0
  );
  assert.equal(ipv4.fromIp, "198.51.100.7");
  assert.equal(ipv4.fromReverseDns, undefined);

  const unknown = parseReceived(
    "from client.local (unknown [10.20.30.40]) by smtp.example.com " +
      "with ESMTPSA id 77; Thu, 4 Sep 2026 10:00:00 +0000",
    0
  );
  assert.equal(unknown.fromReverseDns, undefined);
  assert.equal(unknown.fromIp, "10.20.30.40");
});
