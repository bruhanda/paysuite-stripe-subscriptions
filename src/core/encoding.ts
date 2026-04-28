/**
 * Cross-runtime byte/string helpers built only on Web standards.
 * Kept in `core/` so they're usable from every subpath without pulling in
 * Node-specific APIs (`Buffer`, `node:crypto`, etc.).
 */

const encoder = /* @__PURE__ */ new TextEncoder();

/**
 * UTF-8 encode a string into a `Uint8Array`. Equivalent to
 * `new TextEncoder().encode(text)`, but reuses a single encoder instance.
 *
 * @param text - The string to encode.
 * @returns The UTF-8 byte representation.
 */
export const encodeUtf8 = (text: string): Uint8Array => encoder.encode(text);

/**
 * Convert a byte array to a lowercase hexadecimal string. Used for HMAC
 * comparison against Stripe's `v1=…` signature segments.
 *
 * @param bytes - Bytes to encode.
 * @returns Lowercase hex string of length `bytes.length * 2`.
 */
export const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (const byte of bytes) {
    s += byte.toString(16).padStart(2, '0');
  }
  return s;
};

/**
 * Decode a hexadecimal string into a byte array.
 *
 * @param hex - Even-length hex string.
 * @returns Decoded bytes.
 * @throws {Error} If the input is not valid hex.
 */
export const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length.');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex string: non-hex character.');
    }
    out[i] = byte;
  }
  return out;
};

/**
 * Concatenate any number of byte arrays into a single new `Uint8Array`.
 *
 * @param arrays - Byte arrays to concatenate, in order.
 * @returns A freshly allocated array containing the concatenated bytes.
 */
export const concatBytes = (...arrays: ReadonlyArray<Uint8Array>): Uint8Array => {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};
