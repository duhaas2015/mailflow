import type { RawHeader } from "./types.ts";

/**
 * Header names that declare a message as AI-generated.
 *
 * Nothing standardizes this. `X-AI-Generated` is a convention some MCP servers
 * and mail tools have adopted on their own, so this matches the family of
 * names rather than one exact spelling: anything under an `X-AI-` prefix, or
 * naming itself ai-generated / ai-assisted. The pane shows every match
 * verbatim, so an unexpected hit is visible for what it is rather than
 * silently folded into a verdict.
 */
const AI_HEADER_NAME = /^x-ai-|(^|-)ai-(generated|assisted)(-|$)/i;

/** Values that explicitly deny the claim — a tool saying "no" isn't a flag. */
const NEGATIVE_VALUE = /^(false|no|0|none|off)$/i;

/**
 * Every header in which the sending software declared the message
 * AI-generated, in the order they appear.
 *
 * These are self-declared. Anything that touches the message can add one or
 * strip one, so a match means "the sender's tooling says so" and the absence
 * of one proves nothing at all.
 */
export function findAiDeclarations(headers: RawHeader[]): RawHeader[] {
  return headers.filter(
    (h) => AI_HEADER_NAME.test(h.name) && !NEGATIVE_VALUE.test(h.value.trim())
  );
}
