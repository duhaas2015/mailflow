/** A single `Name: value` pair from the raw MIME header block. */
export interface RawHeader {
  name: string;
  /** Unfolded value, with the leading colon and surrounding whitespace removed. */
  value: string;
}

/** One parsed `Received:` header. */
export interface ReceivedHeader {
  /** Position in the raw header block: 0 is the topmost (last) `Received:` line. */
  index: number;
  /** Host the message came from, as announced in the SMTP `HELO`/`EHLO`. */
  from?: string;
  /** Reverse-DNS name the receiving server resolved for the connecting IP. */
  fromReverseDns?: string;
  /** IP address of the connecting host, if the receiver recorded one. */
  fromIp?: string;
  /** Host that accepted the message on this hop. */
  by?: string;
  /** MTA software the receiving host identified itself as, e.g. "Postfix". */
  bySoftware?: string;
  /** Protocol from the `with` clause, e.g. "ESMTPS", "SMTP", "HTTP". */
  with?: string;
  /** Queue id assigned by the receiving server. */
  id?: string;
  /** Envelope recipient from the `for` clause. */
  for?: string;
  /** TLS version, when the receiver recorded one (common on Exchange). */
  tlsVersion?: string;
  /** Negotiated cipher, when recorded. */
  cipher?: string;
  /** Time the receiving server accepted the message. */
  timestamp?: Date;
  /** The date text we attempted to parse, kept so failures are debuggable. */
  rawDate?: string;
  /** The complete unfolded header value. */
  raw: string;
}

/** A hop in chronological order, with the delay leading into it resolved. */
export interface Hop {
  /** 1-based position in the delivery chain, earliest first. */
  position: number;
  received: ReceivedHeader;
  /**
   * Seconds spent between the previous hop and this one. `null` when it can't
   * be computed because a timestamp is missing on either end.
   */
  delaySeconds: number | null;
  /**
   * True when this hop's clock reads earlier than the previous hop's. Servers
   * disagree about the time more often than you'd think; a negative delay is a
   * clock problem, not a negative transit time.
   */
  clockSkew: boolean;
}

/** Everything the task pane needs to render, derived from one message. */
export interface Timeline {
  hops: Hop[];
  /** `Date:` header — when the sender's client claims it submitted the message. */
  sentAt?: Date;
  /** Timestamp of the final hop: when the message landed in the mailbox. */
  deliveredAt?: Date;
  /** Wall-clock seconds from the earliest to the latest hop timestamp. */
  totalSeconds: number | null;
  /** The slowest single hop, when at least one delay could be computed. */
  slowest?: Hop;
  subject?: string;
  from?: string;
  to?: string;
  messageId?: string;
  /**
   * Exchange's own end-to-end latency measurement, in seconds, when present.
   * Useful as a cross-check against the timestamps we compute.
   */
  exchangeLatencySeconds?: number;
  authResults?: string;
  /** Non-fatal problems worth showing the user rather than silently swallowing. */
  warnings: string[];
}
