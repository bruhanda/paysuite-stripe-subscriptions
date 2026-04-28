import { describe, expect, it } from 'vitest';
import { parseSignatureHeader } from '../webhooks/headers.js';

describe('webhooks/headers/parseSignatureHeader', () => {
  describe('valid input', () => {
    it('should parse a basic t= and v1= header when given canonical format', () => {
      const r = parseSignatureHeader('t=1700000000,v1=abc');
      expect(r).toEqual({ timestamp: 1700000000, v1Signatures: ['abc'] });
    });

    it('should parse multiple v1 signatures when present (key rotation)', () => {
      const r = parseSignatureHeader('t=10,v1=aa,v1=bb');
      expect(r?.v1Signatures).toEqual(['aa', 'bb']);
    });

    it('should ignore other schemes like v0 when parsing', () => {
      const r = parseSignatureHeader('t=10,v0=ignored,v1=abc');
      expect(r).toEqual({ timestamp: 10, v1Signatures: ['abc'] });
    });

    it('should tolerate whitespace around segments and equal signs when parsing', () => {
      const r = parseSignatureHeader('  t = 100 , v1 = ff ');
      expect(r).toEqual({ timestamp: 100, v1Signatures: ['ff'] });
    });

    it('should accept timestamp 0 as valid when parsing', () => {
      const r = parseSignatureHeader('t=0,v1=ab');
      expect(r?.timestamp).toBe(0);
    });
  });

  describe('invalid input', () => {
    it('should return null when given an empty string', () => {
      expect(parseSignatureHeader('')).toBeNull();
    });

    it('should return null when t= segment is missing', () => {
      expect(parseSignatureHeader('v1=abc')).toBeNull();
    });

    it('should return null when no v1= segment exists', () => {
      expect(parseSignatureHeader('t=100')).toBeNull();
    });

    it('should return null when timestamp is non-numeric', () => {
      expect(parseSignatureHeader('t=abc,v1=ff')).toBeNull();
    });

    it('should return null when timestamp is negative', () => {
      expect(parseSignatureHeader('t=-1,v1=ff')).toBeNull();
    });

    it('should return null when timestamp is fractional', () => {
      expect(parseSignatureHeader('t=1.5,v1=ff')).toBeNull();
    });

    it('should return null when timestamp is Infinity', () => {
      expect(parseSignatureHeader('t=Infinity,v1=ff')).toBeNull();
    });

    it('should return null when v1 segment has empty value', () => {
      expect(parseSignatureHeader('t=10,v1=')).toBeNull();
    });

    it('should return null when a segment has no = at all', () => {
      expect(parseSignatureHeader('t=10,bareToken')).toBeNull();
    });

    it('should ignore empty segments between commas when parsing', () => {
      const r = parseSignatureHeader('t=10,,v1=ab');
      expect(r).toEqual({ timestamp: 10, v1Signatures: ['ab'] });
    });
  });
});
