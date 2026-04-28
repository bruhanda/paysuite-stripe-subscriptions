import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  type SubscriptionState,
  reduceSubscription,
} from '../state-machine/reducer.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';

describe('state-machine/reducer/reduceSubscription', () => {
  describe('first-event projection', () => {
    it('should derive a complete SubscriptionState from a created event when prev is null', () => {
      const sub = buildSubscription({
        id: 'sub_123',
        customer: 'cus_1',
        status: 'active',
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              price: { id: 'price_pro' } as Stripe.Price,
              current_period_start: 100,
              current_period_end: 200,
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
        cancel_at_period_end: false,
        trial_end: null,
      });
      const event = buildEvent('customer.subscription.created', sub, {
        created: 1500,
      });
      const next = reduceSubscription(null, event);
      expect(next).toMatchObject<Partial<SubscriptionState>>({
        id: 'sub_123',
        customerId: 'cus_1',
        status: 'active',
        priceId: 'price_pro',
        currentPeriodStart: 100,
        currentPeriodEnd: 200,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        updatedAt: 1500,
      });
    });

    it('should set priceId to null when the subscription has no items', () => {
      const sub = buildSubscription({
        id: 'sub_empty',
        items: {
          object: 'list',
          data: [],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
      });
      const event = buildEvent('customer.subscription.created', sub);
      const next = reduceSubscription(null, event);
      expect(next.priceId).toBeNull();
    });

    it('should resolve customerId from a Customer object when customer is expanded', () => {
      const sub = buildSubscription({
        customer: { id: 'cus_obj' } as Stripe.Customer,
      });
      const event = buildEvent('customer.subscription.updated', sub);
      const next = reduceSubscription(null, event);
      expect(next.customerId).toBe('cus_obj');
    });

    it('should fall back to legacy top-level current_period_* when items lack them', () => {
      const subAny = buildSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              price: { id: 'price_x' } as Stripe.Price,
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
      }) as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };
      subAny.current_period_start = 555;
      subAny.current_period_end = 999;
      const event = buildEvent('customer.subscription.updated', subAny);
      const next = reduceSubscription(null, event);
      expect(next.currentPeriodStart).toBe(555);
      expect(next.currentPeriodEnd).toBe(999);
    });

    it('should default currentPeriodStart and currentPeriodEnd to 0 when neither source has them', () => {
      const subAny = buildSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si',
              price: { id: 'p' } as Stripe.Price,
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
      }) as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };
      delete subAny.current_period_start;
      delete subAny.current_period_end;
      const event = buildEvent('customer.subscription.updated', subAny);
      const next = reduceSubscription(null, event);
      expect(next.currentPeriodStart).toBe(0);
      expect(next.currentPeriodEnd).toBe(0);
    });
  });

  describe('out-of-order delivery', () => {
    it('should drop the event and return prev unchanged when event.created < prev.updatedAt', () => {
      const prev: SubscriptionState = {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        priceId: 'price_pro',
        currentPeriodStart: 100,
        currentPeriodEnd: 200,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        updatedAt: 2000,
      };
      const sub = buildSubscription({ status: 'past_due' });
      const event = buildEvent('customer.subscription.updated', sub, {
        created: 1000,
      });
      const next = reduceSubscription(prev, event);
      expect(next).toBe(prev);
    });

    it('should apply the event when event.created equals prev.updatedAt (same-second tie-break)', () => {
      const prev: SubscriptionState = {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        priceId: 'price_pro',
        currentPeriodStart: 100,
        currentPeriodEnd: 200,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        updatedAt: 2000,
      };
      const sub = buildSubscription({ status: 'past_due' });
      const event = buildEvent('customer.subscription.updated', sub, {
        created: 2000,
      });
      const next = reduceSubscription(prev, event);
      expect(next.status).toBe('past_due');
      expect(next.updatedAt).toBe(2000);
    });
  });

  describe('updates', () => {
    it('should update status when an updated event arrives later', () => {
      const prev: SubscriptionState = {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'trialing',
        priceId: 'price_pro',
        currentPeriodStart: 100,
        currentPeriodEnd: 200,
        cancelAtPeriodEnd: false,
        trialEnd: 1000,
        updatedAt: 1000,
      };
      const sub = buildSubscription({ status: 'active' });
      const event = buildEvent('customer.subscription.updated', sub, {
        created: 2000,
      });
      const next = reduceSubscription(prev, event);
      expect(next.status).toBe('active');
      expect(next.updatedAt).toBe(2000);
    });
  });
});
