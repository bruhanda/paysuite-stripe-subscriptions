import { describe, expect, it } from 'vitest';
import { hmacSha256, timingSafeEqual } from '../core/crypto.js';
import { encodeUtf8, toHex } from '../core/encoding.js';

describe('core/crypto', () => {
  describe('hmacSha256', () => {
    it('should produce a 32-byte MAC when given a string key and data', async () => {
      const mac = await hmacSha256('secret', encodeUtf8('payload'));
      expect(mac).toBeInstanceOf(Uint8Array);
      expect(mac.length).toBe(32);
    });

    it('should produce identical output for identical inputs when called twice', async () => {
      const a = await hmacSha256('secret', encodeUtf8('hello'));
      const b = await hmacSha256('secret', encodeUtf8('hello'));
      expect(toHex(a)).toBe(toHex(b));
    });

    it('should produce different outputs for different keys when input is the same', async () => {
      const a = await hmacSha256('s1', encodeUtf8('payload'));
      const b = await hmacSha256('s2', encodeUtf8('payload'));
      expect(toHex(a)).not.toBe(toHex(b));
    });

    it('should accept a Uint8Array key when given one', async () => {
      const a = await hmacSha256('whsec_test', encodeUtf8('data'));
      const b = await hmacSha256(encodeUtf8('whsec_test'), encodeUtf8('data'));
      expect(toHex(a)).toBe(toHex(b));
    });

    it('should produce the canonical HMAC-SHA256 test vector when called', async () => {
      // RFC 4231 Test Case 1: key=0x0b * 20, data="Hi There"
      const key = new Uint8Array(20).fill(0x0b);
      const mac = await hmacSha256(key, encodeUtf8('Hi There'));
      expect(toHex(mac)).toBe(
        'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
      );
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true when arrays are byte-equal', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('should return false when arrays differ in content', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should return false when arrays differ in length', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([1, 2, 3]);
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should return true when both arrays are empty', () => {
      expect(timingSafeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
    });

    it('should return false when first array is longer', () => {
      expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(
        false,
      );
    });
  });
});
