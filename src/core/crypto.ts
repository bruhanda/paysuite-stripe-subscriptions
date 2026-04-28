import { encodeUtf8 } from './encoding.js';

/**
 * Compute an HMAC-SHA256 over `data` using `key`. Implemented entirely on
 * Web Crypto (`crypto.subtle`) so the same code runs in Node 18+, Bun, Deno,
 * Edge Runtime, and Cloudflare Workers without adapter shims.
 *
 * @param key - The HMAC key. Strings are UTF-8 encoded automatically.
 * @param data - The bytes to authenticate.
 * @returns The 32-byte MAC.
 *
 * @example
 * ```ts
 * const mac = await hmacSha256('whsec_secret', encodeUtf8('payload'));
 * ```
 */
export async function hmacSha256(
  key: string | Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? encodeUtf8(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    // Cast: TS 5.7 typed `Uint8Array` as generic over `ArrayBufferLike`,
    // while `BufferSource` requires the more specific `ArrayBuffer`. The
    // values we pass at runtime are always backed by `ArrayBuffer` — this
    // cast bridges the lib mismatch without weakening the public API.
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Constant-time equality check for two byte arrays. Mitigates timing-side-
 * channel attacks where naive byte-by-byte comparison would leak prefix
 * matches. Always inspects every byte of the longer array.
 *
 * @param a - First byte array.
 * @param b - Second byte array.
 * @returns `true` if the arrays are byte-equal, `false` otherwise.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    // `?? 0` keeps the loop constant-time when the arrays differ in length
    // — every iteration still does the same work; the length mismatch is
    // already mixed into `diff`.
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
