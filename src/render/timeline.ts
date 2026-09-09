import type { Hop, Timeline } from "../parser/types.ts";
import { formatDuration, formatTimestamp, severityOf, splitHostname } from "./format.ts";

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

  const auth = renderAuthResults(timeline);
  if (auth) root.append(auth);
}

/**
 * The at-a-glance answer: how long it took overall, and which hop is to blame.
 * Everything else is one click away.
 */
function renderSummary(timeline: Timeline): HTMLElement {
  const summary = el("section", "summary");

  const total = el("div", "total");
  total.append(
    el("span", "total-value", formatDuration(timeline.totalSeconds)),
    el("span", "total-label", `end to end · ${timeline.hops.length} hops`)
  );
  summary.append(total);

  const worst = timeline.slowest;
  const worstDelay = worst?.delaySeconds;

  if (worst && worstDelay) {
    const blame = el("div", `blame blame--${severityOf(worstDelay)}`);
    const name = worst.received.by ?? "an unnamed server";

    // A skewed clock can make one hop read as longer than the whole journey.
    // Calling it part of the total would then be arithmetic nonsense, so name
    // the hop without asserting the relationship.
    const partOfTotal = timeline.totalSeconds !== null && worstDelay <= timeline.totalSeconds;

    const lead = el("p", "blame-lead");
    if (partOfTotal) {
      lead.append(
        el("strong", undefined, formatDuration(worstDelay)),
        document.createTextNode(" of that was hop "),
        el("strong", undefined, String(worst.position)),
        document.createTextNode(", into")
      );
    } else {
      lead.append(
        document.createTextNode("Slowest was hop "),
        el("strong", undefined, String(worst.position)),
        document.createTextNode(" at "),
        el("strong", undefined, formatDuration(worstDelay)),
        document.createTextNode(", into")
      );
    }
    blame.append(lead);

    // Split the same way the hop rows do. A mail hostname is one unbreakable
    // token, so left inline it simply runs off the edge of the pane.
    const { label, domain } = splitHostname(name);
    const host = el("p", "blame-host");
    host.append(el("span", "blame-host-label", label));
    if (domain) host.append(el("span", "blame-host-domain", domain));
    blame.append(host);

    summary.append(blame);
  }

  const facts = el("dl", "facts");
  addFact(facts, "Sent", formatTimestamp(timeline.sentAt));
  addFact(facts, "Delivered", formatTimestamp(timeline.deliveredAt));

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

/**
 * One line per hop: position, delay, a proportional bar, and the receiving
 * server. Detail is behind a native <details> so the whole chain fits on one
 * screen and expanding is keyboard-accessible for free.
 */
function renderHop(hop: Hop, longest: number, slowest: Hop | undefined): HTMLElement {
  const severity = severityOf(hop.delaySeconds);
  const item = el("li", `hop hop--${severity}`);
  if (slowest && hop.position === slowest.position && hop.delaySeconds) {
    item.classList.add("hop--worst");
  }

  const details = el("details", "hop-details");
  const summary = el("summary", "hop-summary");

  summary.append(el("span", "hop-index", String(hop.position)));

  // A skewed clock means the delay is unmeasurable, not zero. Showing "<1s"
  // there would read as "this hop was instant", which we don't know.
  summary.append(
    el("span", "hop-delay", formatDuration(hop.clockSkew ? null : hop.delaySeconds))
  );

  const track = el("span", "hop-bar-track");
  const bar = el("span", "hop-bar");
  // A measurable-but-tiny delay still gets a sliver of bar, so "fast" reads as
  // different from "unknown".
  bar.style.width =
    hop.delaySeconds === null ? "0%" : `${Math.max(4, (hop.delaySeconds / longest) * 100)}%`;
  track.append(bar);
  summary.append(track);

  // The label carries the identity and the domain is mostly boilerplate, so
  // they get separate lines: the distinguishing part stays readable instead of
  // being the first casualty of truncation.
  const name = hop.received.by ?? "unknown server";
  const { label, domain } = splitHostname(name);

  const host = el("span", "hop-host");
  host.title = name;
  host.append(el("span", "hop-host-label", label));
  if (domain) host.append(el("span", "hop-host-domain", domain));
  summary.append(host);

  details.append(summary, renderHopDetail(hop));
  item.append(details);
  return item;
}

function renderHopDetail(hop: Hop): HTMLElement {
  const detail = el("div", "hop-detail");
  const facts = el("dl", "detail-facts");
  const received = hop.received;

  // The summary truncates long names, so this is the one place the receiving
  // server is guaranteed to appear in full.
  if (received.by) addFact(facts, "Server", received.by);
  addFact(facts, "Received at", formatTimestamp(received.timestamp));

  if (hop.clockSkew) {
    addFact(facts, "Clock", "Reads earlier than the previous hop, so this delay can't be measured.");
  }

  if (received.from) addFact(facts, "From", received.from);
  if (received.fromReverseDns) addFact(facts, "Reverse DNS", received.fromReverseDns);
  if (received.fromIp) addFact(facts, "IP", received.fromIp);
  if (received.with) addFact(facts, "Protocol", received.with);
  if (received.tlsVersion) {
    addFact(facts, "TLS", [received.tlsVersion, received.cipher].filter(Boolean).join(" · "));
  }
  if (received.bySoftware) addFact(facts, "Software", received.bySoftware);
  if (received.id) addFact(facts, "Queue ID", received.id);
  if (received.for) addFact(facts, "Envelope to", received.for);

  detail.append(facts);

  const raw = el("details", "raw");
  raw.append(el("summary", undefined, "Raw header"), el("pre", "raw-line", received.raw));
  detail.append(raw);

  return detail;
}

/** SPF/DKIM/DMARC, when the receiving server recorded them. */
function renderAuthResults(timeline: Timeline): HTMLElement | undefined {
  if (!timeline.authResults) return undefined;

  const details = el("details", "raw raw--footer");
  details.append(
    el("summary", undefined, "Authentication results"),
    el("pre", "raw-line", timeline.authResults)
  );
  return details;
}
