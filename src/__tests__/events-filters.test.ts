import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  isCheckoutSessionEvent,
  isInvoiceEvent,
  isSubscriptionEvent,
} from '../events/filters.js';

const make = (type: string): Stripe.Event =>
  ({
    id: 'evt_1',
    type,
    data: { object: {} },
  }) as unknown as Stripe.Event;

describe('events/filters', () => {
  describe('isSubscriptionEvent', () => {
    it('should return true for customer.subscription.* events when called', () => {
      expect(isSubscriptionEvent(make('customer.subscription.created'))).toBe(true);
      expect(isSubscriptionEvent(make('customer.subscription.updated'))).toBe(true);
      expect(isSubscriptionEvent(make('customer.subscription.deleted'))).toBe(true);
      expect(isSubscriptionEvent(make('customer.subscription.paused'))).toBe(true);
    });

    it('should return false for unrelated event types when called', () => {
      expect(isSubscriptionEvent(make('invoice.paid'))).toBe(false);
      expect(isSubscriptionEvent(make('checkout.session.completed'))).toBe(false);
      expect(isSubscriptionEvent(make('customer.created'))).toBe(false);
    });

    it('should narrow the event type when used as a guard', () => {
      const event = make('customer.subscription.updated');
      if (isSubscriptionEvent(event)) {
        // type-level: event narrowed
        expect(event.type.startsWith('customer.subscription.')).toBe(true);
      }
    });
  });

  describe('isInvoiceEvent', () => {
    it('should return true for invoice.* events when called', () => {
      expect(isInvoiceEvent(make('invoice.paid'))).toBe(true);
      expect(isInvoiceEvent(make('invoice.payment_failed'))).toBe(true);
      expect(isInvoiceEvent(make('invoice.upcoming'))).toBe(true);
    });

    it('should return false for non-invoice events when called', () => {
      expect(isInvoiceEvent(make('customer.subscription.updated'))).toBe(false);
      expect(isInvoiceEvent(make('checkout.session.expired'))).toBe(false);
    });
  });

  describe('isCheckoutSessionEvent', () => {
    it('should return true for checkout.session.* events when called', () => {
      expect(isCheckoutSessionEvent(make('checkout.session.completed'))).toBe(true);
      expect(isCheckoutSessionEvent(make('checkout.session.expired'))).toBe(true);
    });

    it('should return false for unrelated events when called', () => {
      expect(isCheckoutSessionEvent(make('invoice.paid'))).toBe(false);
      expect(isCheckoutSessionEvent(make('customer.subscription.created'))).toBe(false);
    });
  });
});
