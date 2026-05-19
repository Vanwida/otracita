import { parsePhoneNumberFromString } from 'libphonenumber-js';

// -----------------------------------------------------------------------------
// Phone canonicalization — FUENTE ÚNICA.
//
// Why this file exists: the SAME human was being split into multiple
// `customers` rows because every entry point stored the phone in whatever
// shape it arrived in:
//
//   · WhatsApp Cloud API delivers `from` as a bare intl number: 34644288663
//   · The PWA OTP form lets people type 644288663 or +34 644 28 86 63
//   · Booksy import / vision OCR yields anything (0034…, parens, dashes)
//   · The dashboard typeahead matched on the raw string
//
//   644288663  ≠  +34644288663  ≠  34644288663   →  3 customer rows for
//   one person → loyalty balance, history, no-show reputation all fragmented.
//
// The fix is architectural: ONE canonical form (E.164, e.g. +34644288663)
// computed by ONE function, applied at every customer create / match /
// upsert site. No per-callsite regex anywhere — they used to disagree
// (there were 3 hand-rolled `normalisePhone` and a `digitsOnly` that all
// handled prefixes slightly differently).
//
// Spain-first: bare 6XX/7XX/9XX numbers and 34-prefixed numbers without
// `+` are assumed Spanish. Already-E.164 foreign numbers (+44…, +1…) pass
// through untouched — we never coerce them to +34.
//
// Invalid input NEVER throws and NEVER loses data: we return the trimmed
// raw string and `valid: false`. Storing the raw value (instead of null /
// a synthetic placeholder) keeps the booking attributable and lets a human
// fix it later from the dashboard. It just won't merge with other formats
// until corrected — acceptable, because the alternative (crash, or silently
// dropping the phone) is worse.
// -----------------------------------------------------------------------------

/** Default region for numbers given without an international prefix. */
const DEFAULT_REGION = 'ES' as const;

export interface CanonicalPhone {
  /**
   * The phone to PERSIST and to MATCH on. E.164 (`+34644288663`) when the
   * input parsed to a valid number; otherwise the trimmed raw input
   * (best-effort, so the record stays attributable).
   */
  value: string;
  /**
   * `true`  → `value` is a real E.164 number, safe to dedupe on.
   * `false` → `value` is unparseable raw input; callers may want to flag it
   *           (e.g. the `import-*` pseudo-phone path) but MUST still store
   *           it so the booking/customer isn't lost.
   */
  valid: boolean;
}

/**
 * Canonicalize a phone number to E.164, Spanish default.
 *
 * Handles, all collapsing to the same canonical value:
 *   · bare national:           `644288663`, `911234567`
 *   · `+34` prefix:            `+34644288663`, `+34 644 28 86 63`
 *   · `0034` / `00 34` prefix: `0034644288663`
 *   · bare `34` country code:  `34644288663`
 *   · separators:              spaces, dashes, dots, parens
 *   · already-E.164 foreign:   `+447911123456` → unchanged (NOT forced +34)
 *
 * Empty / whitespace / unparseable → `{ value: <trimmed raw>, valid: false }`.
 * Never throws.
 */
export function canonicalizePhone(raw: string | null | undefined): CanonicalPhone {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { value: '', valid: false };

  // `0034…` is the ITU "00" international call prefix. libphonenumber-js
  // does not strip a lone leading `00` for region ES (00 is ES's IDD, so
  // it could in principle, but the parser treats `0034…` as national here).
  // Normalising `00` → `+` up front makes `0034644288663` behave exactly
  // like `+34644288663`. We only rewrite a leading `00` followed by digits;
  // everything else (spaces, dashes, parens) libphonenumber-js cleans itself.
  const normalised = /^\s*00\d/.test(trimmed)
    ? trimmed.replace(/^\s*00/, '+')
    : trimmed;

  try {
    const parsed = parsePhoneNumberFromString(normalised, DEFAULT_REGION);
    if (parsed && parsed.isValid()) {
      // `.number` is the E.164 form (`+<cc><national>`), digits only.
      return { value: parsed.number, valid: true };
    }
  } catch {
    // parsePhoneNumberFromString is the non-throwing API, but stay defensive:
    // a malformed input must never crash a booking/upsert path.
  }

  return { value: trimmed, valid: false };
}

/**
 * Shorthand when the caller just wants the string to store / match on and
 * does not branch on validity. Equivalent to `canonicalizePhone(raw).value`.
 *
 * Use this at every customer create/match/upsert site so the SAME human
 * always resolves to the SAME row. Returns '' for empty input — callers
 * that require a phone should validate emptiness themselves (they did
 * before this util too).
 */
export function canonicalPhone(raw: string | null | undefined): string {
  return canonicalizePhone(raw).value;
}
