import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDuration, severityOf, splitHostname } from "../src/render/format.ts";

test("splits a hostname at its first label", () => {
  assert.deepEqual(splitHostname("CH3PR05MB9434.namprd05.prod.outlook.com"), {
    label: "CH3PR05MB9434",
    domain: "namprd05.prod.outlook.com",
  });
  assert.deepEqual(splitHostname("mail-wr1-f54.google.com"), {
    label: "mail-wr1-f54",
    domain: "google.com",
  });
});

test("leaves address literals and bare labels whole", () => {
  // Splitting at the first dot would show "10" as though it were a server.
  assert.deepEqual(splitHostname("10.174.208.35"), { label: "10.174.208.35" });
  assert.deepEqual(splitHostname("2603:10b6:170:205::23"), { label: "2603:10b6:170:205::23" });
  assert.deepEqual(splitHostname("localhost"), { label: "localhost" });
  assert.deepEqual(splitHostname("unknown server"), { label: "unknown server" });
});

test("formats durations at the scale a reader compares them", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(0.4), "<1s");
  assert.equal(formatDuration(22), "22s");
  assert.equal(formatDuration(262), "4m 22s");
  assert.equal(formatDuration(120), "2m");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(3780), "1h 3m");
});

test("grades delays by how concerning they are", () => {
  assert.equal(severityOf(null), "normal");
  assert.equal(severityOf(2), "normal");
  assert.equal(severityOf(30), "slow");
  assert.equal(severityOf(300), "severe");
});
