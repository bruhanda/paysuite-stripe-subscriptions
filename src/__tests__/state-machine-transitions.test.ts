import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { ErrorCodes } from '../errors/codes.js';
import { InvalidTransitionError } from '../errors/index.js';
import {
  VALID_TRANSITIONS,
  validateSubscriptionTransition,
} from '../state-machine/transitions.js';

describe('state-machine/transitions', () => {
  describe('VALID_TRANSITIONS', () => {
    it('should be defined for every status when read', () => {
      const statuses = [
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
      ] as const;
      for (const s of statuses) {
        expect(VALID_TRANSITIONS[s]).toBeDefined();
      }
    });

    it('should mark canceled and incomplete_expired as terminal states', () => {
      expect(VALID_TRANSITIONS.canceled).toEqual([]);
      expect(VALID_TRANSITIONS.incomplete_expired).toEqual([]);
    });
  });

  describe('validateSubscriptionTransition', () => {
    it('should return Ok when transitioning to the same status (no-op update)', () => {
      const r = validateSubscriptionTransition('active', 'active');
      expect(isOk(r)).toBe(true);
      if (r.ok) expect(r.value).toEqual({ from: 'active', to: 'active' });
    });

    it('should return Ok for an allowed transition (trialing → active)', () => {
      const r = validateSubscriptionTransition('trialing', 'active');
      expect(isOk(r)).toBe(true);
    });

    it('should return Ok for active → past_due (delinquent flow)', () => {
      const r = validateSubscriptionTransition('active', 'past_due');
      expect(isOk(r)).toBe(true);
    });

    it('should return Err for a disallowed transition (canceled → active)', () => {
      const r = validateSubscriptionTransition('canceled', 'active');
      expect(isErr(r)).toBe(true);
      if (!r.ok) {
        expect(r.error).toBeInstanceOf(InvalidTransitionError);
        expect(r.error.code).toBe(ErrorCodes.INVALID_TRANSITION);
        expect(r.error.details).toEqual({ from: 'canceled', to: 'active' });
      }
    });

    it('should return Err when transitioning out of a terminal state to anything else', () => {
      const r = validateSubscriptionTransition('incomplete_expired', 'active');
      expect(isErr(r)).toBe(true);
    });

    it('should return Err for active → trialing (cannot regress to trial)', () => {
      const r = validateSubscriptionTransition('active', 'trialing');
      expect(isErr(r)).toBe(true);
    });

    it('should match every entry in VALID_TRANSITIONS when iterated', () => {
      for (const [from, allowed] of Object.entries(VALID_TRANSITIONS)) {
        for (const to of allowed) {
          const r = validateSubscriptionTransition(
            from as never,
            to as never,
          );
          expect(isOk(r)).toBe(true);
        }
      }
    });
  });
});
