import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type Err,
  type Ok,
  type Result,
  err,
  isErr,
  isOk,
  ok,
} from '../core/result.js';

describe('core/result', () => {
  describe('ok', () => {
    it('should wrap value in an Ok branch when called', () => {
      const r = ok(42);
      expect(r).toEqual({ ok: true, value: 42 });
    });

    it('should preserve referential identity of the wrapped value when given an object', () => {
      const obj = { foo: 'bar' };
      const r = ok(obj);
      expect(r.value).toBe(obj);
    });

    it('should accept null and undefined as valid Ok values when wrapping', () => {
      expect(ok(null)).toEqual({ ok: true, value: null });
      expect(ok(undefined)).toEqual({ ok: true, value: undefined });
    });

    it('should produce a precisely-typed Ok<T> when given a primitive', () => {
      const r = ok('hello');
      expectTypeOf(r).toEqualTypeOf<Ok<string>>();
    });
  });

  describe('err', () => {
    it('should wrap error in an Err branch when called', () => {
      const r = err(new Error('boom'));
      expect(r.ok).toBe(false);
      expect((r as Err<Error>).error.message).toBe('boom');
    });

    it('should accept arbitrary error types when called', () => {
      const r = err({ code: 'X' });
      expect(r).toEqual({ ok: false, error: { code: 'X' } });
    });

    it('should produce a precisely-typed Err<E> when given a typed error', () => {
      const r = err('failure');
      expectTypeOf(r).toEqualTypeOf<Err<string>>();
    });
  });

  describe('isOk', () => {
    it('should return true when given an Ok branch', () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it('should return false when given an Err branch', () => {
      expect(isOk(err('e'))).toBe(false);
    });

    it('should narrow type to Ok<T> when used as a guard', () => {
      const r: Result<number, string> = ok(5);
      if (isOk(r)) {
        expectTypeOf(r).toEqualTypeOf<Ok<number>>();
        expect(r.value).toBe(5);
      }
    });
  });

  describe('isErr', () => {
    it('should return true when given an Err branch', () => {
      expect(isErr(err('boom'))).toBe(true);
    });

    it('should return false when given an Ok branch', () => {
      expect(isErr(ok('x'))).toBe(false);
    });

    it('should narrow type to Err<E> when used as a guard', () => {
      const r: Result<number, string> = err('boom');
      if (isErr(r)) {
        expectTypeOf(r).toEqualTypeOf<Err<string>>();
        expect(r.error).toBe('boom');
      }
    });
  });
});
