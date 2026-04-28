import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../core/encoding.js';
import { isErr, isOk } from '../core/result.js';
import { ErrorCodes } from '../errors/codes.js';
import { parseEvent } from '../webhooks/parser.js';

const validEvent = {
  id: 'evt_1',
  type: 'invoice.paid',
  data: { object: { id: 'in_1' } },
};

describe('webhooks/parser/parseEvent', () => {
  describe('valid input', () => {
    it('should parse a valid Stripe event from a string when called', () => {
      const r = parseEvent(JSON.stringify(validEvent));
      expect(isOk(r)).toBe(true);
      if (r.ok) expect(r.value.id).toBe('evt_1');
    });

    it('should parse a valid Stripe event from Uint8Array bytes when called', () => {
      const r = parseEvent(encodeUtf8(JSON.stringify(validEvent)));
      expect(isOk(r)).toBe(true);
    });

    it('should parse a valid Stripe event from ArrayBuffer when called', () => {
      const ab = encodeUtf8(JSON.stringify(validEvent)).buffer.slice(0);
      const r = parseEvent(ab as ArrayBuffer);
      expect(isOk(r)).toBe(true);
    });
  });

  describe('invalid UTF-8', () => {
    it('should return MALFORMED_PAYLOAD when bytes are not valid UTF-8', () => {
      // 0xC3 alone is an incomplete UTF-8 sequence
      const r = parseEvent(new Uint8Array([0xc3]));
      expect(isErr(r)).toBe(true);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.MALFORMED_PAYLOAD);
    });
  });

  describe('invalid JSON', () => {
    it('should return MALFORMED_PAYLOAD when the body is not JSON', () => {
      const r = parseEvent('not json');
      expect(isErr(r)).toBe(true);
      if (!r.ok) {
        expect(r.error.code).toBe(ErrorCodes.MALFORMED_PAYLOAD);
        expect(r.error.message).toMatch(/JSON/);
      }
    });
  });

  describe('structural validation', () => {
    it('should return MALFORMED_PAYLOAD when given JSON that is not an object', () => {
      const r = parseEvent('"a string"');
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when given null', () => {
      const r = parseEvent('null');
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when id is missing', () => {
      const r = parseEvent(JSON.stringify({ type: 't', data: { object: {} } }));
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when id is not a string', () => {
      const r = parseEvent(JSON.stringify({ id: 1, type: 't', data: { object: {} } }));
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when type is missing', () => {
      const r = parseEvent(JSON.stringify({ id: 'e', data: { object: {} } }));
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when data is missing', () => {
      const r = parseEvent(JSON.stringify({ id: 'e', type: 't' }));
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when data.object is missing', () => {
      const r = parseEvent(JSON.stringify({ id: 'e', type: 't', data: {} }));
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when data.object is null', () => {
      const r = parseEvent(
        JSON.stringify({ id: 'e', type: 't', data: { object: null } }),
      );
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when data.object is an array', () => {
      const r = parseEvent(
        JSON.stringify({ id: 'e', type: 't', data: { object: [] } }),
      );
      expect(isErr(r)).toBe(true);
    });

    it('should return MALFORMED_PAYLOAD when data.object is a primitive', () => {
      const r = parseEvent(
        JSON.stringify({ id: 'e', type: 't', data: { object: 'string' } }),
      );
      expect(isErr(r)).toBe(true);
    });
  });
});
