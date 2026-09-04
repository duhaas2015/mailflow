import type { Timeline } from "../parser/types.ts";
import { formatDuration, formatTimestamp } from "./format.ts";

/**
 * A plain-text rendering of the timeline, for pasting into a ticket. Chasing a
 * delay usually means handing evidence to whoever runs the mail servers, and
 * they want the hops as text, not a screenshot.
 */
export function textReport(timeline: Timeline): string {
  const lines: string[] = [];

  lines.push(`Subject:   ${timeline.subject ?? "(none)"}`);
  lines.push(`From:      ${timeline.from ?? "(unknown)"}`);
  lines.push(`Sent:      ${formatTimestamp(timeline.sentAt)}`);
  lines.push(`Delivered: ${formatTimestamp(timeline.deliveredAt)}`);
  lines.push(`Total:     ${formatDuration(timeline.totalSeconds)} across ${timeline.hops.length} hops`);

  if (timeline.messageId) lines.push(`Message-ID: ${timeline.messageId}`);
  lines.push("");

  for (const hop of timeline.hops) {
    const host = hop.received.by ?? "unknown server";
    const delay = hop.delaySeconds === null ? "—" : formatDuration(hop.delaySeconds);
    const skew = hop.clockSkew ? "  [clock skew]" : "";

    lines.push(`${hop.position}. +${delay.padEnd(8)} ${host}${skew}`);
    lines.push(`   at ${formatTimestamp(hop.received.timestamp)}`);

    const origin = hop.received.fromReverseDns ?? hop.received.from;
    if (origin) lines.push(`   from ${origin}${hop.received.fromIp ? ` [${hop.received.fromIp}]` : ""}`);

    const protocol = [hop.received.with, hop.received.tlsVersion].filter(Boolean).join(" / ");
    if (protocol) lines.push(`   via ${protocol}`);

    lines.push("");
  }

  for (const warning of timeline.warnings) lines.push(`Note: ${warning}`);

  return lines.join("\n");
}
