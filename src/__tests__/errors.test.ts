import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  type ErrorCode,
  ErrorCodes,
  HandlerError,
  InvalidTransitionError,
  PaySuiteError,
  SignatureVerificationError,
  StoreError,
} from '../errors/index.js';

describe('errors', () => {
  describe('ErrorCodes', () => {
    it('should contain every documented code when iterated', () => {
      expect(Object.keys(ErrorCodes).sort()).toEqual(
        [
          'CONFIG_INVALID',
          'HANDLER_FAILED',
          'INVALID_SIGNATURE_FORMAT',
          'INVALID_TRANSITION',
          'MALFORMED_PAYLOAD',
          'MISSING_SECRET',
          'SIGNATURE_MISMATCH',
          'SIGNATURE_TIMESTAMP_IN_FUTURE',
          'SIGNATURE_TIMESTAMP_TOO_OLD',
          'STORE_UNAVAILABLE',
          'UNKNOWN_PRICE_ID',
        ].sort(),
      );
    });

    it('should map each key to its identical literal value when accessed', () => {
      for (const [k, v] of Object.entries(ErrorCodes)) {
        expect(v).toBe(k);
      }
    });

    it('should produce ErrorCode union literal types when used', () => {
      const c: ErrorCode = ErrorCodes.MISSING_SECRET;
      expect(c).toBe('MISSING_SECRET');
    });
  });

  describe('PaySuiteError', () => {
    it('should set name, code and message when constructed', () => {
      const e = new PaySuiteError({
        code: ErrorCodes.MISSING_SECRET,
        message: 'no secret',
      });
      expect(e.name).toBe('PaySuiteError');
      expect(e.code).toBe('MISSING_SECRET');
      expect(e.message).toBe('no secret');
    });

    it('should be an instance of Error when constructed', () => {
      const e = new PaySuiteError({ code: ErrorCodes.CONFIG_INVALID, message: 'm' });
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(PaySuiteError);
    });

    it('should freeze details to prevent later mutation when provided', () => {
      const e = new PaySuiteError({
        code: ErrorCodes.CONFIG_INVALID,
        message: 'm',
        details: { foo: 'bar' },
      });
      expect(Object.isFrozen(e.details)).toBe(true);
      expect(() => {
        // @ts-expect-error - frozen
        e.details.foo = 'baz';
      }).toThrow();
    });

    it('should leave details undefined when not provided', () => {
      const e = new PaySuiteError({ code: ErrorCodes.CONFIG_INVALID, message: 'm' });
      expect(e.details).toBeUndefined();
    });

    it('should preserve the cause when provided', () => {
      const cause = new Error('underlying');
      const e = new PaySuiteError({
        code: ErrorCodes.CONFIG_INVALID,
        message: 'm',
        cause,
      });
      expect(e.cause).toBe(cause);
    });

    it('should clone details so mutating the source does not change the error when constructed', () => {
      const src = { a: 1 };
      const e = new PaySuiteError({
        code: ErrorCodes.CONFIG_INVALID,
        message: 'm',
        details: src,
      });
      src.a = 99;
      expect(e.details?.a).toBe(1);
    });

    describe('toJSON', () => {
      it('should return name, code and message when called on a basic error', () => {
        const e = new PaySuiteError({ code: ErrorCodes.MISSING_SECRET, message: 'm' });
        const json = e.toJSON();
        expect(json).toEqual({
          name: 'PaySuiteError',
          code: 'MISSING_SECRET',
          message: 'm',
        });
      });

      it('should include details when present', () => {
        const e = new PaySuiteError({
          code: ErrorCodes.MISSING_SECRET,
          message: 'm',
          details: { foo: 'bar' },
        });
        expect(e.toJSON().details).toEqual({ foo: 'bar' });
      });

      it('should serialize a PaySuiteError cause via toJSON when nested', () => {
        const inner = new PaySuiteError({
          code: ErrorCodes.MALFORMED_PAYLOAD,
          message: 'inner',
        });
        const outer = new PaySuiteError({
          code: ErrorCodes.HANDLER_FAILED,
          message: 'outer',
          cause: inner,
        });
        expect(outer.toJSON().cause).toEqual({
          name: 'PaySuiteError',
          code: 'MALFORMED_PAYLOAD',
          message: 'inner',
        });
      });

      it('should serialize a non-PaySuite Error cause to a name-message pair when nested', () => {
        const cause = new TypeError('bad arg');
        const e = new PaySuiteError({
          code: ErrorCodes.HANDLER_FAILED,
          message: 'wrapped',
          cause,
        });
        expect(e.toJSON().cause).toEqual({ name: 'TypeError', message: 'bad arg' });
      });

      it('should pass through non-error causes verbatim when serializing', () => {
        const e = new PaySuiteError({
          code: ErrorCodes.HANDLER_FAILED,
          message: 'wrapped',
          cause: 'string cause',
        });
        expect(e.toJSON().cause).toBe('string cause');
      });

      it('should be JSON.stringify-safe when called via JSON.stringify', () => {
        const e = new PaySuiteError({
          code: ErrorCodes.CONFIG_INVALID,
          message: 'm',
          details: { a: 1 },
        });
        const s = JSON.stringify(e);
        expect(JSON.parse(s)).toEqual({
          name: 'PaySuiteError',
          code: 'CONFIG_INVALID',
          message: 'm',
          details: { a: 1 },
        });
      });
    });
  });

  describe('subclasses', () => {
    it.each([
      ['SignatureVerificationError', SignatureVerificationError],
      ['InvalidTransitionError', InvalidTransitionError],
      ['ConfigError', ConfigError],
      ['StoreError', StoreError],
      ['HandlerError', HandlerError],
    ] as const)(
      'should set name to %s when constructed',
      (name, Klass) => {
        const e = new Klass({ code: ErrorCodes.CONFIG_INVALID, message: 'm' });
        expect(e.name).toBe(name);
        expect(e).toBeInstanceOf(PaySuiteError);
        expect(e).toBeInstanceOf(Error);
      },
    );

    it('should preserve toJSON behaviour on subclasses when serialized', () => {
      const e = new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_MISMATCH,
        message: 'mismatch',
        details: { received: 'v1=abc' },
      });
      expect(e.toJSON()).toEqual({
        name: 'SignatureVerificationError',
        code: 'SIGNATURE_MISMATCH',
        message: 'mismatch',
        details: { received: 'v1=abc' },
      });
    });
  });
});
