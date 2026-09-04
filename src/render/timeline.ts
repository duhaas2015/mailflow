import type { Hop, Timeline } from "../parser/types.ts";
import { bareAddress, formatDuration, formatTimestamp, severityOf } from "./format.ts";

/**
 * Every string on this screen came off the wire and is controlled by whoever
 * sent the message. Nothing here goes through innerHTML — we build nodes and
 * assign textContent so a header can never inject markup into the task pane.
 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderTimeline(timeline: Timeline, root: HTMLElement): void {
  root.replaceChildren();
  root.append(renderSummary(timeline));

  for (const warning of timeline.warnings) {
    root.append(el("div", "warning", warning));
  }

  if (timeline.hops.length === 0) return;

  // Bars are scaled against the slowest hop so the shape of the delay is
  // obvious at a glance, rather than every bar looking the same.
  const longest = Math.max(...timeline.hops.map((h) => h.delaySeconds ?? 0), 1);

  const list = el("ol", "hops");
  for (const hop of timeline.hops) list.append(renderHop(hop, longest, timeline.slowest));
  root.append(list);

  root.append(renderRawToggle(timeline));
}

function renderSummary(timeline: Timeline): HTMLElement {
  const summary = el("section", "summary");

  const total = el("div", "total");
  total.append(
    el("span", "total-value", formatDuration(timeline.totalSeconds)),
    el("span", "total-label", "end to end")
  );
  summary.append(total);

  const facts = el("dl", "facts");
  addFact(facts, "Hops", String(timeline.hops.length));
  addFact(facts, "Sent", formatTimestamp(timeline.sentAt));
  addFact(facts, "Delivered", formatTimestamp(timeline.deliveredAt));

  if (timeline.slowest) {
    const worst = timeline.slowest.received.by ?? `hop ${timeline.slowest.position}`;
    addFact(facts, "Slowest hop", `${formatDuration(timeline.slowest.delaySeconds)} into ${worst}`);
  }

  if (timeline.exchangeLatencySeconds !== undefined) {
    // Exchange measured this itself. When it disagrees with our number, the
    // gap is usually a hop that stripped or rewrote its own timestamp.
    addFact(facts, "Exchange reports", formatDuration(timeline.exchangeLatencySeconds));
  }

  summary.append(facts);
  return summary;
}

function addFact(list: HTMLElement, label: string, value: string): void {
  list.append(el("dt", undefined, label), el("dd", undefined, value));
}

function renderHop(hop: Hop, longest: number, slowest: Hop | undefined): HTMLElement {
  const severity = severityOf(hop.delaySeconds);
  const item = el("li", `hop hop--${severity}`);
  if (slowest && hop.position === slowest.position && hop.delaySeconds) {
    item.classList.add("hop--worst");
  }

  const delay = el("div", "hop-delay");
  // A skewed clock means the delay is unmeasurable, not zero. Showing "<1s"
  // there would read as "this hop was instant", which we don't know.
  delay.append(
    el("span", "hop-delay-value", formatDuration(hop.clockSkew ? null : hop.delaySeconds))
  );

  const track = el("div", "hop-bar-track");
  const bar = el("div", "hop-bar");
  // A measurable-but-tiny delay still gets a sliver of bar, so "fast" reads as
  // different from "unknown".
  bar.style.width =
    hop.delaySeconds === null ? "0%" : `${Math.max(2, (hop.delaySeconds / longest) * 100)}%`;
  track.append(bar);
  delay.append(track);

  if (hop.clockSkew) {
    delay.append(el("span", "hop-skew", "clock skew"));
  }

  const body = el("div", "hop-body");
  body.append(el("div", "hop-host", hop.received.by ?? "unknown server"));

  const origin = hop.received.fromReverseDns ?? hop.received.from;
  if (origin) {
    body.append(el("div", "hop-from", `from ${origin}`));
  }

  const meta = el("div", "hop-meta");
  meta.append(el("span", "hop-time", formatTimestamp(hop.received.timestamp)));
  for (const chip of [hop.received.fromIp, hop.received.with, hop.received.tlsVersion]) {
    if (chip) meta.append(el("span", "chip", chip));
  }
  if (hop.received.bySoftware) meta.append(el("span", "chip", hop.received.bySoftware));
  body.append(meta);

  item.append(el("div", "hop-index", String(hop.position)), delay, body);
  return item;
}

/** Collapsed raw view, for when the parse itself is what's in question. */
function renderRawToggle(timeline: Timeline): HTMLElement {
  const details = el("details", "raw");
  details.append(el("summary", undefined, "Raw Received headers"));

  for (const hop of timeline.hops) {
    details.append(el("pre", "raw-line", hop.received.raw));
  }

  if (timeline.authResults) {
    details.append(
      el("h3", "raw-heading", "Authentication-Results"),
      el("pre", "raw-line", timeline.authResults)
    );
  }

  return details;
}
