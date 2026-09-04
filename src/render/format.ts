/** How concerning a single hop's delay is. Drives the colour of its bar. */
export type Severity = "normal" | "slow" | "severe";

const SLOW_SECONDS = 5;
const SEVERE_SECONDS = 60;

export function severityOf(seconds: number | null): Severity {
  if (seconds === null || seconds < SLOW_SECONDS) return "normal";
  return seconds < SEVERE_SECONDS ? "slow" : "severe";
}

/**
 * Render a duration the way someone chasing a delay wants to read it: coarse
 * enough to scan, precise enough to compare two hops.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** Absolute time in the reader's own zone — the frame of reference they have. */
export function formatTimestamp(date: Date | undefined): string {
  if (!date) return "no timestamp";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Strip a display name off an address header, keeping just the address. */
export function bareAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const angled = /<([^>]+)>/.exec(value);
  return (angled?.[1] ?? value).trim();
}
