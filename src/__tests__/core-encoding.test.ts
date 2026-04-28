import { describe, expect, it } from 'vitest';
import { concatBytes, encodeUtf8, fromHex, toHex } from '../core/encoding.js';

describe('core/encoding', () => {
  describe('encodeUtf8', () => {
    it('should encode an ASCII string to UTF-8 bytes when given simple text', () => {
      expect(encodeUtf8('abc')).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
    });

    it('should encode an empty string to an empty array when called', () => {
      expect(encodeUtf8('').length).toBe(0);
    });

    it('should encode multi-byte unicode characters correctly when given UTF-8 input', () => {
      const bytes = encodeUtf8('héllo');
      expect(Array.from(bytes)).toEqual([0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f]);
    });

    it('should handle emoji characters when encoding', () => {
      const bytes = encodeUtf8('🚀');
      expect(bytes.length).toBe(4);
    });
  });

  describe('toHex', () => {
    it('should produce lowercase hex from a byte array when called', () => {
      expect(toHex(new Uint8Array([0xab, 0xcd, 0xef]))).toBe('abcdef');
    });

    it('should pad single-digit nibbles with leading zero when encoding', () => {
      expect(toHex(new Uint8Array([0x00, 0x0a, 0x0f]))).toBe('000a0f');
    });

    it('should return empty string when given an empty array', () => {
      expect(toHex(new Uint8Array())).toBe('');
    });

    it('should produce a string of length bytes.length*2 when called', () => {
      const bytes = new Uint8Array(32);
      expect(toHex(bytes)).toHaveLength(64);
    });
  });

  describe('fromHex', () => {
    it('should decode a hex string into bytes when given lowercase input', () => {
      expect(Array.from(fromHex('abcdef'))).toEqual([0xab, 0xcd, 0xef]);
    });

    it('should decode uppercase hex strings when given them', () => {
      expect(Array.from(fromHex('ABCDEF'))).toEqual([0xab, 0xcd, 0xef]);
    });

    it('should return empty array when given empty string', () => {
      expect(fromHex('')).toEqual(new Uint8Array());
    });

    it('should round-trip via toHex when chained', () => {
      const original = new Uint8Array([0, 1, 2, 100, 200, 255]);
      expect(Array.from(fromHex(toHex(original)))).toEqual(Array.from(original));
    });

    it('should throw when given an odd-length hex string', () => {
      expect(() => fromHex('abc')).toThrow(/odd length/);
    });

    it('should throw when given non-hex characters', () => {
      expect(() => fromHex('zz')).toThrow(/non-hex character/);
    });
  });

  describe('concatBytes', () => {
    it('should concatenate two byte arrays in order when called with two args', () => {
      const r = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3, 4]));
      expect(Array.from(r)).toEqual([1, 2, 3, 4]);
    });

    it('should concatenate an arbitrary number of arrays when given many args', () => {
      const r = concatBytes(
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
        new Uint8Array([4]),
      );
      expect(Array.from(r)).toEqual([1, 2, 3, 4]);
    });

    it('should return an empty Uint8Array when called with no arguments', () => {
      expect(concatBytes()).toEqual(new Uint8Array());
    });

    it('should produce a fresh array independent of inputs when called', () => {
      const a = new Uint8Array([1, 2]);
      const r = concatBytes(a);
      r[0] = 99;
      expect(a[0]).toBe(1);
    });
  });
});
