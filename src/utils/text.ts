// Added by Mats Cedergren, 2026: text helpers for log messages.

/** Ends the text with a period, unless it already ends with a period, question mark or exclamation mark. */
export function asSentence(text: string): string {
  const trimmed = text.trimEnd();
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
