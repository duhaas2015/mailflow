import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTimeline, parseReceived } from "../src/parser/received.ts";
import { describeRole } from "../src/render/role.ts";
import type { Hop } from "../src/parser/types.ts";

function hopFrom(raw: string): Hop {
  return { position: 1, received: parseReceived(raw, 0), delaySeconds: null, clockSkew: false };
}

test("reads an authenticated submission off the protocol suffix", () => {
  const hop = hopFrom(
    "from workstation.partner.example (unknown [10.20.30.40]) by smtp.partner.example " +
      "(Postfix) with ESMTPSA id 77De11; Thu, 4 Sep 2026 10:38:02 +0000"
  );
  const role = describeRole(hop, true, false);

  assert.equal(role?.label, "Submitted");
  assert.match(role!.because, /authenticated/);
});

test("calls the first hop the origin when nothing precedes it", () => {
  const hop = hopFrom(
    "by mail-wr1-f54.google.com with SMTP id abc123so456789wrx.11 " +
      "for <duane@example.com>; Thu, 04 Sep 2026 09:45:30 -0700 (PDT)"
  );

  assert.equal(describeRole(hop, true, false)?.label, "Origin");
});

test("recognises Exchange's own frontend marker", () => {
  const hop = hopFrom(
    "from mail-wr1-f54.google.com (209.85.221.54) by MW4PR03CA0123.outlook.office365.com " +
      "(10.174.208.35) with Microsoft SMTP Server id 15.20.6792.29 via Frontend Transport; " +
      "Thu, 4 Sep 2026 16:49:52 +0000"
  );

  assert.equal(describeRole(hop, false, false)?.label, "Edge");
});

test("calls a hop internal only when both servers share a domain", () => {
  const internal = hopFrom(
    "from CC6PR05MB223767.namprd05.prod.outlook.com (2603:10b6:170:205::23) " +
      "by CH3PR05MB9434.namprd05.prod.outlook.com (2603:10b6:610:1f3::8) " +
      "with Microsoft SMTP Server id 15.20; Tue, 8 Sep 2026 17:40:26 +0000"
  );
  assert.equal(describeRole(internal, false, false)?.label, "Internal");
});

test("makes no claim when the two domains merely differ", () => {
  // Different Exchange Online forests are not a crossing between
  // organizations, and nothing in the header says which this is.
  const forests = hopFrom(
    "from BN9PR03CA0129.namprd03.prod.outlook.com (2603:10b6:408:fe::14) " +
      "by CC6PR05MB223767.namprd05.prod.outlook.com (2603:10b6:170:205::23) " +
      "with Microsoft SMTP Server id 15.20; Tue, 8 Sep 2026 17:40:04 +0000"
  );
  assert.equal(describeRole(forests, false, false), undefined);

  const different = hopFrom(
    "from smtp.partner.example (smtp.partner.example [192.0.2.15]) " +
      "by filter-07.securemail.example (Postfix) with ESMTPS id 9AbC22; " +
      "Thu, 4 Sep 2026 11:12:30 +0000"
  );
  assert.equal(describeRole(different, false, false), undefined);
});

test("says nothing when the evidence doesn't decide it", () => {
  // Only an IP on the sending side: there's no name to compare, and inventing
  // a relationship would look identical to a fact on screen.
  const hop = hopFrom(
    "from (10.1.1.1) by b.example.com with SMTP id 1; Thu, 4 Sep 2026 10:00:00 +0000"
  );

  assert.equal(describeRole(hop, false, false), undefined);
});

test("labels the final hop as delivery", () => {
  const hop = hopFrom(
    "from CH3PR05MB9434.namprd05.prod.outlook.com (2603:10b6:610:1f3::8) " +
      "by CH2PR05MB7215.namprd05.prod.outlook.com with HTTPS; Tue, 8 Sep 2026 17:40:26 +0000"
  );

  assert.equal(describeRole(hop, false, true)?.label, "Delivered");
});

test("assigns a coherent set of roles across a real chain", () => {
  const timeline = buildTimeline(`Received: from mx.example.net (mx.example.net [198.51.100.20]) by
 mail.example.com (Postfix) with ESMTPS id 4Xk8vT2; Thu, 4 Sep 2026 11:12:41 +0000
Received: from smtp.partner.example (smtp.partner.example [192.0.2.15])
 by mx.example.net (Postfix) with ESMTPS id 9AbC22; Thu, 4 Sep 2026 11:12:30 +0000
Received: from workstation.partner.example (unknown [10.20.30.40])
 by smtp.partner.example (Postfix) with ESMTPSA id 77De11; Thu, 4 Sep 2026 10:38:02 +0000`);

  const roles = timeline.hops.map((hop, i) =>
    describeRole(hop, i === 0, i === timeline.hops.length - 1)?.label
  );

  assert.deepEqual(roles, ["Submitted", undefined, "Delivered"]);
});
