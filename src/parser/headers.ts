import type { RawHeader } from "./types.ts";

/**
 * Undo RFC 5322 header folding: a field continues onto the next line whenever
 * that line begins with whitespace. We drop the line break and keep a single
 * space so tokens either side don't get glued together.
 */
export function unfold(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]+/g, " ");
}

/**
 * Split a raw MIME header block into ordered name/value pairs. Order matters
 * here: `Received:` headers are only interpretable in the sequence they appear.
 */
export function parseHeaderBlock(raw: string): RawHeader[] {
  const headers: RawHeader[] = [];

  for (const line of unfold(raw).split("\n")) {
    if (!line.trim()) continue;

    const colon = line.indexOf(":");
    // A line with no colon isn't a header field. This shows up when a message
    // body sneaks into the block; skipping is friendlier than throwing.
    if (colon <= 0) continue;

    headers.push({
      name: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).trim(),
    });
  }

  return headers;
}

/** First value for a header name, matched case-insensitively. */
export function getHeader(headers: RawHeader[], name: string): string | undefined {
  const wanted = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === wanted)?.value;
}

/** Every value for a header name, in the order they appeared. */
export function getHeaders(headers: RawHeader[], name: string): string[] {
  const wanted = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === wanted).map((h) => h.value);
}

/**
 * Strip RFC 5322 comments — parenthesised runs, which nest and honour
 * backslash escapes. Quoted strings are left alone, since a "(" inside quotes
 * is literal text rather than the start of a comment.
 */
export function stripComments(input: string): string {
  let out = "";
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === "\\" && i + 1 < input.length) {
      // An escaped character is never structural, in or out of a comment.
      if (depth === 0) out += ch + input[i + 1];
      i++;
      continue;
    }

    if (ch === '"' && depth === 0) {
      inQuotes = !inQuotes;
      out += ch;
      continue;
    }

    if (!inQuotes && ch === "(") {
      depth++;
      continue;
    }

    if (!inQuotes && ch === ")") {
      if (depth > 0) depth--;
      // An unbalanced ")" is malformed; dropping it beats corrupting the rest.
      continue;
    }

    if (depth === 0) out += ch;
  }

  return out;
}
