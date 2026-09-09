import type { Hop } from "../parser/types.ts";

/** A short badge for a hop, plus the evidence it was drawn from. */
export interface HopRole {
  label: string;
  /** Why we say so, in plain terms. Shown when the hop is expanded. */
  because: string;
}

/**
 * Describe what a hop *is*, using only what the header states outright.
 *
 * The line this draws matters. Protocol suffixes, the Frontend Transport
 * marker and the presence of a `from` clause are facts the receiving server
 * recorded. Guessing a vendor from a hostname, or an organization from a
 * domain, is inference dressed as fact — a hop labelled "spam filter" that
 * turns out to be a mailing list sends someone chasing the wrong server. When
 * the evidence doesn't decide it, this returns nothing and the hop simply
 * carries no badge.
 */
export function describeRole(hop: Hop, isFirst: boolean, isLast: boolean): HopRole | undefined {
  const received = hop.received;
  const protocol = received.with ?? "";

  // RFC 3848 appends "A" to the protocol when the client authenticated, so
  // ESMTPSA / ESMTPA means a mail client handing over its own message.
  if (/\bE?SMTPS?A\b/i.test(protocol)) {
    return {
      label: "Submitted",
      because: `The sending client authenticated here (${protocol.trim()}), so this is where the message entered the mail system.`,
    };
  }

  if (isFirst && !received.from) {
    return {
      label: "Origin",
      because: "No earlier server is recorded, so the message started its journey here.",
    };
  }

  // Exchange writes this marker itself on the internet-facing layer.
  if (/frontend transport/i.test(received.raw)) {
    return {
      label: "Edge",
      because: "This server recorded 'via Frontend Transport', which is Exchange's internet-facing layer — where mail from outside is first accepted.",
    };
  }

  if (isLast) {
    return {
      label: "Delivered",
      because: "The last hop recorded on the message: where it landed in the mailbox.",
    };
  }

  const from = parentDomain(received.fromReverseDns ?? received.from);
  const by = parentDomain(received.by);

  // Without a name on both sides there's nothing to compare, and a guess here
  // would be indistinguishable from a fact on screen.
  if (!from || !by) return undefined;

  // Only the matching case is claimed. Two hosts under one domain really are
  // one system, but two *different* domains prove very little: namprd03 and
  // namprd05 are both Exchange Online, and calling that a handoff between
  // organizations would invent a boundary that isn't there. Silence is the
  // honest answer for everything else.
  if (from === by) {
    return {
      label: "Internal",
      because: `Both servers sit under ${by}, so the message moved inside one system rather than between two.`,
    };
  }

  return undefined;
}

/**
 * Everything after the first label, lowercased. This is deliberately not a
 * registrable-domain lookup: without the public suffix list, treating the last
 * two labels as the organization would call two unrelated .co.uk hosts the
 * same company. Comparing the immediate parent understates the claim, which is
 * the right direction to be wrong in.
 */
function parentDomain(host: string | undefined): string | undefined {
  if (!host) return undefined;
  if (host.includes(":") || /^[\d.]+$/.test(host)) return undefined; // address literal

  const dot = host.indexOf(".");
  return dot > 0 ? host.slice(dot + 1).toLowerCase() : undefined;
}
