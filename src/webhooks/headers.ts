/**
 * Parsed shape of the `Stripe-Signature` HTTP header. Only `v1` segments
 * are surfaced — Stripe documents `v0` and other schemes as ignorable for
 * webhook receivers.
 */
export interface ParsedSignatureHeader {
  /** Unix-seconds timestamp from the `t=` segment. */
  readonly timestamp: number;
  /** Hex-encoded HMAC-SHA256 signatures from each `v1=` segment. */
  readonly v1Signatures: ReadonlyArray<string>;
}

/**
 * Parse the value of a `Stripe-Signature` header into a {@link ParsedSignatureHeader}.
 * Tolerates whitespace and multiple `v1=` segments (Stripe may rotate
 * signing secrets and emit two side-by-side).
 *
 * @param header - The raw header value.
 * @returns The parsed header on success, or `null` if the input is malformed
 *          (missing `t=`, no `v1=` segment, non-integer timestamp, ...).
 *
 * @example
 * ```ts
 * const parsed = parseSignatureHeader('t=1700000000,v1=abcd...');
 * if (parsed) console.log(parsed.timestamp);
 * ```
 */
export function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  if (header.length === 0) return null;

  let timestamp: number | null = null;
  const v1Signatures: string[] = [];

  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return null;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    if (key === 't') {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
      timestamp = n;
    } else if (key === 'v1') {
      if (value.length === 0) return null;
      v1Signatures.push(value);
    }
    // Other schemes (`v0`, ...) are silently ignored per Stripe's spec.
  }

  if (timestamp === null) return null;
  if (v1Signatures.length === 0) return null;
  return { timestamp, v1Signatures };
}
