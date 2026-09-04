import { getHeader, getHeaders, parseHeaderBlock, stripComments } from "./headers.ts";
import { parseRfc5322Date } from "./date.ts";
import type { Hop, ReceivedHeader, Timeline } from "./types.ts";

/** Clause keywords defined for the `Received:` field by RFC 5321 §4.4. */
const CLAUSE_KEYWORDS = ["from", "by", "via", "with", "id", "for"] as const;
type Clause = (typeof CLAUSE_KEYWORDS)[number];

const IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
const IPV6 = /\b([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})\b/i;

/**
 * Parse one `Received:` value.
 *
 * The grammar is loose and every MTA stretches it differently, so rather than
 * matching a single monolithic pattern we locate the clause keywords at paren
 * depth zero and slice between them. Anything we can't identify is left
 * undefined instead of guessed — a wrong hostname on a timeline is worse than
 * a blank one.
 */
export function parseReceived(raw: string, index: number): ReceivedHeader {
  const header: ReceivedHeader = { index, raw };

  const { clauses: clauseText, date: dateText } = splitOffDate(raw);
  if (dateText) {
    header.rawDate = dateText;
    header.timestamp = parseRfc5322Date(dateText) ?? undefined;
  }

  const clauses = sliceClauses(clauseText);

  const fromClause = clauses.get("from");
  if (fromClause) {
    const { host, detail } = splitHostAndDetail(fromClause);
    header.from = host || undefined;

    if (detail) {
      // The parenthesised detail is the receiver's own view of the connection:
      // the reverse-DNS name it looked up, and the IP it actually saw. That IP
      // is the trustworthy half — the HELO name is whatever the client claimed.
      const ip = extractIp(detail);
      if (ip) header.fromIp = ip;

      const reverseDns = detail
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\b(?:helo|ehlo)=\S+/gi, " ")
        .trim()
        .split(/\s+/)[0];

      // Only keep it if it actually looks like a name. Skipping this lets an
      // IPv6 literal through — its hex digits read as letters — and the hop
      // then shows the same address twice, once as a name and once as an IP.
      if (reverseDns && isHostname(reverseDns) && reverseDns !== header.fromIp) {
        header.fromReverseDns = reverseDns;
      }
    }
  }

  const byClause = clauses.get("by");
  if (byClause) {
    const { host, detail } = splitHostAndDetail(byClause);
    header.by = host || undefined;
    // Postfix, Exim and friends name themselves here; Exchange puts an IP
    // instead, which is noise rather than software.
    if (detail && /[a-z]/i.test(detail) && !extractIp(detail)) {
      header.bySoftware = detail.trim() || undefined;
    }
  }

  const withClause = clauses.get("with");
  if (withClause) header.with = stripComments(withClause).trim().replace(/\s+/g, " ") || undefined;

  const idClause = clauses.get("id");
  if (idClause) header.id = stripComments(idClause).trim().split(/\s+/)[0];

  const forClause = clauses.get("for");
  if (forClause) header.for = stripComments(forClause).trim().replace(/^<|>;?$/g, "") || undefined;

  // Exchange records the negotiated TLS parameters inside the `with` comment;
  // other MTAs scatter them elsewhere, so search the whole line.
  const tls = /version=(TLS\S+?)[,)\s]/i.exec(raw) ?? /\(using (TLSv?[\d._]+)/i.exec(raw);
  if (tls) header.tlsVersion = tls[1]!.replace(/[,)]$/, "");

  const cipher = /cipher=([A-Za-z0-9_-]+)/i.exec(raw);
  if (cipher) header.cipher = cipher[1];

  return header;
}

/**
 * Split a `Received:` value into its clause text and its date text at the last
 * top-level ";". Scanning from the right matters: queue ids and comments
 * contain semicolons of their own.
 */
function splitOffDate(raw: string): { clauses: string; date?: string } {
  let depth = 0;

  for (let i = raw.length - 1; i >= 0; i--) {
    const ch = raw[i];
    if (ch === ")") depth++;
    else if (ch === "(") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      return { clauses: raw.slice(0, i), date: raw.slice(i + 1).trim() };
    }
  }

  // No semicolon: some MTAs omit the date entirely. The hop is still real and
  // still belongs on the timeline, just without a time of its own.
  return { clauses: raw };
}

/** Map each clause keyword to the text between it and the next keyword. */
function sliceClauses(text: string): Map<Clause, string> {
  const found: Array<{ keyword: Clause; start: number; end: number }> = [];
  let depth = 0;
  let wordStart = -1;

  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : " ";

    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    const isWordChar = depth === 0 && ch !== undefined && /[A-Za-z]/.test(ch);

    if (isWordChar) {
      if (wordStart === -1) wordStart = i;
      continue;
    }

    if (wordStart !== -1) {
      const word = text.slice(wordStart, i).toLowerCase() as Clause;
      // Only a keyword standing alone as a whole word starts a clause, which
      // keeps a hostname like "forward.example.com" from reading as `for`.
      if ((CLAUSE_KEYWORDS as readonly string[]).includes(word)) {
        found.push({ keyword: word, start: wordStart, end: i });
      }
      wordStart = -1;
    }
  }

  const clauses = new Map<Clause, string>();
  for (let i = 0; i < found.length; i++) {
    const current = found[i]!;
    const next = found[i + 1];
    // First occurrence wins; a repeated keyword is malformed and the leading
    // one is the one the receiving MTA meant.
    if (!clauses.has(current.keyword)) {
      clauses.set(current.keyword, text.slice(current.end, next ? next.start : text.length).trim());
    }
  }

  return clauses;
}

/** Separate a bare host token from its trailing parenthesised detail. */
function splitHostAndDetail(clause: string): { host: string; detail?: string } {
  const open = clause.indexOf("(");
  if (open === -1) return { host: clause.trim().replace(/;$/, "") };

  const close = clause.lastIndexOf(")");
  return {
    host: clause.slice(0, open).trim().replace(/;$/, ""),
    detail: close > open ? clause.slice(open + 1, close).trim() : clause.slice(open + 1).trim(),
  };
}

/** Does this token look like a DNS name rather than an address literal? */
function isHostname(value: string): boolean {
  const name = value.replace(/\.$/, "");

  if (name.toLowerCase() === "unknown") return false;
  if (name.includes(":")) return false; // IPv6 literal
  if (/^[\d.]+$/.test(name)) return false; // IPv4 literal

  // A reverse-DNS name is dotted and contains at least one letter.
  return name.includes(".") && /[a-z]/i.test(name);
}

function extractIp(text: string): string | undefined {
  const bracketed = /\[(?:IPv6:)?([^\]]+)\]/i.exec(text);
  const candidate = bracketed?.[1] ?? text;

  const v4 = IPV4.exec(candidate);
  if (v4 && v4[1]!.split(".").every((octet) => Number(octet) <= 255)) return v4[1];

  const v6 = IPV6.exec(candidate);
  if (v6 && v6[1]!.includes(":")) return v6[1];

  return undefined;
}

/**
 * Parse `X-MS-Exchange-Transport-EndToEndLatency`, which Exchange writes as
 * `HH:MM:SS.fffffff`. It's Exchange's own measurement, so it's a useful
 * sanity check against the number we derive from timestamps.
 */
function parseExchangeLatency(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return undefined;

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * Turn a raw MIME header block into the chronological delivery timeline.
 *
 * `Received:` headers are prepended by each server as the message travels, so
 * the block reads newest-first. We reverse it to get the order the message
 * actually took.
 */
export function buildTimeline(rawHeaders: string): Timeline {
  const headers = parseHeaderBlock(rawHeaders);
  const warnings: string[] = [];

  const received = getHeaders(headers, "Received").map(parseReceived);

  if (received.length === 0) {
    warnings.push(
      "No Received headers found. Messages sent within your own organization are often delivered without them."
    );
  }

  const chronological = [...received].reverse();

  const missingTimestamps = chronological.filter((r) => !r.timestamp).length;
  if (missingTimestamps > 0) {
    warnings.push(
      `${missingTimestamps} of ${chronological.length} hops had no readable timestamp, so some delays can't be measured.`
    );
  }

  const hops: Hop[] = chronological.map((entry, i) => {
    const previous = chronological[i - 1];
    let delaySeconds: number | null = null;
    let clockSkew = false;

    if (i > 0 && entry.timestamp && previous?.timestamp) {
      const seconds = (entry.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
      // A hop can't take negative time. When it reads that way the two servers
      // disagree about the clock, so we report zero and flag it rather than
      // pretending the message arrived before it was sent.
      clockSkew = seconds < 0;
      delaySeconds = clockSkew ? 0 : seconds;
    }

    return { position: i + 1, received: entry, delaySeconds, clockSkew };
  });

  if (hops.some((h) => h.clockSkew)) {
    warnings.push(
      "At least one server's clock disagrees with the one before it. Delays around those hops are approximate."
    );
  }

  const stamped = chronological.filter((r) => r.timestamp);
  const first = stamped[0]?.timestamp;
  const last = stamped[stamped.length - 1]?.timestamp;

  const measured = hops.filter((h) => h.delaySeconds !== null);
  const slowest = measured.length
    ? measured.reduce((worst, hop) => (hop.delaySeconds! > worst.delaySeconds! ? hop : worst))
    : undefined;

  return {
    hops,
    sentAt: parseRfc5322Date(getHeader(headers, "Date") ?? "") ?? undefined,
    deliveredAt: last,
    totalSeconds: first && last ? (last.getTime() - first.getTime()) / 1000 : null,
    slowest,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    messageId: getHeader(headers, "Message-ID"),
    exchangeLatencySeconds: parseExchangeLatency(
      getHeader(headers, "X-MS-Exchange-Transport-EndToEndLatency")
    ),
    authResults: getHeader(headers, "Authentication-Results"),
    warnings,
  };
}
