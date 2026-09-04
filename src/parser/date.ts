import { stripComments } from "./headers.ts";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Obsolete alphabetic zones from RFC 5322 §4.3, in minutes east of UTC.
 * Real-world MTAs still emit these, so we can't just reject them.
 */
const OBSOLETE_ZONES: Readonly<Record<string, number>> = {
  ut: 0, gmt: 0, z: 0,
  est: -300, edt: -240,
  cst: -360, cdt: -300,
  mst: -420, mdt: -360,
  pst: -480, pdt: -420,
};

const DATE_PATTERN =
  /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(.*)$/;

/**
 * Parse an RFC 5322 date-time into a `Date`.
 *
 * We do this by hand rather than leaning on `Date.parse`, because engines
 * disagree on the obsolete forms — and an add-in runs in whichever WebView the
 * host happens to use (Edge on Windows, WebKit on Mac). A timestamp that
 * silently parses to a different instant on one platform would quietly corrupt
 * every delay we report.
 *
 * Returns `null` when the input can't be read as a date.
 */
export function parseRfc5322Date(input: string): Date | null {
  // Comments carry the friendly zone name — "(PDT)" — but never the offset
  // we should trust, so they go before we start matching.
  let text = stripComments(input).trim();

  // The day-of-week prefix is optional and carries no information we need.
  text = text.replace(/^[A-Za-z]{3,9},?\s+/, "");

  const match = DATE_PATTERN.exec(text);
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, secondText, zoneText] = match;

  const month = MONTHS[monthText!.toLowerCase()];
  if (month === undefined) return null;

  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText ? Number(secondText) : 0;

  // Leap seconds are legal in the grammar, so 60 is allowed here.
  if (day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;

  const year = normalizeYear(yearText!);
  const offsetMinutes = parseZone(zoneText ?? "");
  if (offsetMinutes === null) return null;

  // Date.UTC happily rolls 31 April over into May. Check the calendar date
  // before the zone offset shifts it, so a malformed date fails loudly instead
  // of landing a hop in the wrong place on the timeline.
  const calendar = new Date(Date.UTC(year, month, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Two- and three-digit years, per the obsolete rules in RFC 5322 §4.3. */
function normalizeYear(yearText: string): number {
  const year = Number(yearText);
  if (yearText.length === 4) return year;
  if (yearText.length === 3) return 1900 + year;
  return year < 50 ? 2000 + year : 1900 + year;
}

/** Zone offset in minutes east of UTC, or `null` if unreadable. */
function parseZone(zoneText: string): number | null {
  const zone = zoneText.trim();

  // No zone at all. RFC 5322 says to assume local time, but a delivery chain
  // spans machines, so guessing the *reader's* zone would be actively
  // misleading. UTC is the honest default.
  if (!zone) return 0;

  const numeric = /^([+-])(\d{2})(\d{2})$/.exec(zone);
  if (numeric) {
    const sign = numeric[1] === "-" ? -1 : 1;
    const hours = Number(numeric[2]);
    const minutes = Number(numeric[3]);
    if (minutes > 59) return null;
    return sign * (hours * 60 + minutes);
  }

  const named = OBSOLETE_ZONES[zone.toLowerCase()];
  if (named !== undefined) return named;

  // Single-letter military zones are defined backwards in so much deployed
  // software that RFC 5322 §4.3 tells us to read them as "-0000", i.e. UTC.
  if (/^[A-IK-Za-ik-z]$/.test(zone)) return 0;

  return null;
}
