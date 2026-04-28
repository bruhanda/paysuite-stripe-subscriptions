import type Stripe from 'stripe';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { StripeEventOf } from '../events/types.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';

describe('testing/factories', () => {
  describe('buildSubscription', () => {
    it('should return a structurally-valid Stripe subscription with defaults when called', () => {
      const sub = buildSubscription();
      expect(sub.id).toBe('sub_test_default');
      expect(sub.customer).toBe('cus_test_default');
      expect(sub.status).toBe('active');
      expect(sub.cancel_at_period_end).toBe(false);
      expect(sub.items.data).toEqual([]);
    });

    it('should apply overrides over the defaults when called with partial fields', () => {
      const sub = buildSubscription({ id: 'sub_custom', status: 'past_due' });
      expect(sub.id).toBe('sub_custom');
      expect(sub.status).toBe('past_due');
    });

    it('should return fresh nested objects on each call to avoid cross-test leakage', () => {
      const a = buildSubscription();
      const b = buildSubscription();
      expect(a.metadata).not.toBe(b.metadata);
      expect(a.items).not.toBe(b.items);
    });

    it('should populate current_period_* defaults to a 30-day window when constructed', () => {
      const sub = buildSubscription() as Stripe.Subscription & {
        current_period_start: number;
        current_period_end: number;
      };
      expect(sub.current_period_end - sub.current_period_start).toBe(30 * 24 * 3600);
    });

    it('should produce a Stripe.Subscription-typed value when called', () => {
      const sub = buildSubscription();
      expectTypeOf(sub).toEqualTypeOf<Stripe.Subscription>();
    });
  });

  describe('buildEvent', () => {
    it('should produce a typed event with the requested name when called', () => {
      const sub = buildSubscription();
      const event = buildEvent('customer.subscription.updated', sub);
      expect(event.type).toBe('customer.subscription.updated');
      expect(event.data.object).toBe(sub);
    });

    it('should give a unique id and a numeric created timestamp by default when constructed', () => {
      const a = buildEvent('invoice.paid', {} as Stripe.Invoice);
      const b = buildEvent('invoice.paid', {} as Stripe.Invoice);
      expect(a.id).not.toBe(b.id);
      expect(typeof a.created).toBe('number');
    });

    it('should apply overrides over the defaults when fields are passed', () => {
      const event = buildEvent(
        'customer.subscription.created',
        buildSubscription(),
        { id: 'evt_pinned', created: 12345 },
      );
      expect(event.id).toBe('evt_pinned');
      expect(event.created).toBe(12345);
    });

    it('should produce a precisely-typed StripeEventOf<N> when called', () => {
      const event = buildEvent('customer.subscription.deleted', buildSubscription());
      expectTypeOf(event).toEqualTypeOf<StripeEventOf<'customer.subscription.deleted'>>();
    });
  });
});
