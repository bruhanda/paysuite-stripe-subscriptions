import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_STATUSES } from '../state-machine/status.js';

describe('state-machine/status', () => {
  it('should expose every documented Stripe subscription status when iterated', () => {
    expect(SUBSCRIPTION_STATUSES).toEqual([
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
    ]);
  });

  it('should be a readonly array shape when accessed', () => {
    expect(Array.isArray(SUBSCRIPTION_STATUSES)).toBe(true);
  });
});
