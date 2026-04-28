import { describe, expect, expectTypeOf, it } from 'vitest';
import { type Clock, systemClock } from '../core/time.js';

describe('core/time', () => {
  describe('systemClock', () => {
    it('should return the current epoch milliseconds when called', () => {
      const before = Date.now();
      const t = systemClock();
      const after = Date.now();
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });

    it('should be assignable to Clock type when passed around', () => {
      const c: Clock = systemClock;
      expect(typeof c()).toBe('number');
    });

    it('should match the Clock type signature', () => {
      expectTypeOf(systemClock).toEqualTypeOf<Clock>();
    });
  });

  describe('Clock type', () => {
    it('should accept any function returning a number when used', () => {
      const fixed: Clock = () => 1700000000000;
      expect(fixed()).toBe(1700000000000);
    });
  });
});
