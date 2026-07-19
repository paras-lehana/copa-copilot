// sanitize.ts — defence-in-depth input sanitisation, applied AFTER zod validation.
// Zod already rejects malformed/oversize/markup input; this strips the residual
// classes that pass a type check but poison logs, terminals or downstream prompts:
// control characters and zero-width/bidi steganography (Trojan-Source, CVE-2021-42574),
// then collapses whitespace and caps length. Implemented with explicit code-point
// checks (not a control-character regex) so the intent is legible and lint-clean.
// Pure functions, no side effects — unit-tested in security.test.ts.

/** Hard cap so a field can never blow up a log line or a prompt window. */
export const MAX_SANITIZED_LENGTH = 2000;

/**
 * Invisible/format code points with no place in a free-text field: zero-width chars,
 * LTR/RTL marks, bidirectional embeddings + overrides, word-joiner and BOM. These are
 * the characters used to hide instructions inside otherwise "clean" looking text.
 */
const INVISIBLE_CODE_POINTS = new Set<number>([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, // zero-width space/joiner + LTR/RTL marks
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // bidi embeddings + overrides
  0x2060, 0xfeff, // word joiner, BOM / zero-width no-break space
]);

/** True for a C0/C1 control character — EXCEPT tab/newline/carriage-return, which are
 *  legitimate whitespace and get collapsed rather than deleted. */
function isControlToStrip(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/** True for any character this module removes (control OR invisible/format). */
function isStrippable(code: number): boolean {
  return isControlToStrip(code) || INVISIBLE_CODE_POINTS.has(code);
}

/**
 * Strip control + invisible characters, collapse runs of whitespace, trim, and cap
 * length. Returns text safe to log, echo and embed in a grounded prompt. A zero-width
 * space between two words is removed (joining them); ordinary spaces are collapsed.
 */
export function sanitizeText(input: string, maxLength: number = MAX_SANITIZED_LENGTH): string {
  let cleaned = '';
  for (const ch of input) {
    if (!isStrippable(ch.codePointAt(0) ?? 0)) cleaned += ch;
  }
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * True when text contains characters that have no place in a user free-text field —
 * used to flag (not silently accept) suspicious input. Returns true when a control
 * character or a bidi/zero-width format character is present, false otherwise.
 */
export function hasSuspiciousChars(input: string): boolean {
  for (const ch of input) {
    if (isStrippable(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}
