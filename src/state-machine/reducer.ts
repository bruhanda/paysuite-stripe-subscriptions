import type Stripe from 'stripe';
import type { StripeEventOf } from '../events/types.js';
import type { SubscriptionStatus } from './status.js';

/**
 * The minimal, persistence-ready projection of a Stripe subscription that
 * this library cares about. Designed to be pasted into your DB schema with
 * minimal fuss — every field is a primitive (no nested Stripe objects).
 */
export interface SubscriptionState {
  /** Stripe subscription id (`sub_…`). */
  id: string;
  /** Stripe customer id (`cus_…`). */
  customerId: string;
  /** Current Stripe status — see {@link SubscriptionStatus}. */
  status: SubscriptionStatus;
  /** Active price id; for multi-item subscriptions, the *first* item's price. */
  priceId: string;
  /** Unix-seconds of the current period start. */
  currentPeriodStart: number;
  /** Unix-seconds of the current period end. */
  currentPeriodEnd: number;
  /** Whether cancellation is queued for end-of-period. */
  cancelAtPeriodEnd: boolean;
  /** Unix-seconds when the trial ends (or `null` if there is no trial). */
  trialEnd: number | null;
  /** Unix-seconds — high-water mark for out-of-order webhook detection. */
  updatedAt: number;
}

/** The set of events accepted by {@link reduceSubscription}. */
export type ReducibleSubscriptionEvent = StripeEventOf<
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
>;

/**
 * Pure event-sourced reducer. Derives the next {@link SubscriptionState}
 * from the previous state (or `null` on first-seen) and a Stripe event.
 * Drops out-of-order events (where `event.created < prev.updatedAt`) so
 * that Stripe's unordered delivery cannot regress local state.
 *
 * Named `reduceSubscription` to avoid auto-import collisions with
 * `Array.prototype.reduce` and Redux conventions.
 *
 * @param prev  - Previous projection, or `null` for the first event.
 * @param event - One of the customer.subscription.* events.
 * @returns The next {@link SubscriptionState}; if the event is stale
 *          relative to `prev`, `prev` is returned unchanged.
 *
 * @example
 * ```ts
 * const next = reduceSubscription(prev, event);
 * await db.upsertSubscription(next);
 * ```
 */
export function reduceSubscription(
  prev: SubscriptionState | null,
  event: ReducibleSubscriptionEvent,
): SubscriptionState {
  const sub = event.data.object;

  if (prev !== null && event.created < prev.updatedAt) {
    return prev;
  }

  return {
    id: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    // Cast: `sub.status` is a Stripe-defined union we mirror in
    // `SubscriptionStatus`. Stripe may add new statuses in the future
    // (§9.3 #16 in PLAN.md); the cast preserves the raw value rather than
    // erroring, with the understanding that consumers branching on a closed
    // union will see TypeScript flag the new status when they upgrade.
    status: sub.status as SubscriptionStatus,
    priceId: extractPriceId(sub),
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: sub.trial_end,
    updatedAt: event.created,
  };
}

function extractPriceId(sub: Stripe.Subscription): string {
  const item = sub.items.data[0];
  if (item === undefined) return '';
  return item.price.id;
}
