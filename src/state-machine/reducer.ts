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
  /**
   * Active price id; for multi-item subscriptions, the *first* item's price.
   * `null` when the subscription has no items (a malformed input we surface
   * rather than masking with an empty string — feature lookups against `''`
   * would otherwise silently treat the price as "unknown plan").
   */
  priceId: string | null;
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
 * Same-second tie-breaking: Stripe's `event.created` has 1-second
 * resolution, so two genuinely-distinct events emitted in the same second
 * can arrive in either order. The reducer treats `event.created ===
 * prev.updatedAt` as "apply" (the second event in the same second wins),
 * trading rare duplicate application for never-skipping a real update.
 * Persistence layers that need stricter monotonicity should compare on a
 * server-provided sequence number instead.
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

  const periods = extractPeriods(sub);
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
    currentPeriodStart: periods.start,
    currentPeriodEnd: periods.end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: sub.trial_end,
    updatedAt: event.created,
  };
}

function extractPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  if (item === undefined) return null;
  return item.price.id;
}

/**
 * Read `current_period_start` / `current_period_end` from the subscription.
 * Stripe API version `2025-03-31.basil` moved these off the top-level
 * Subscription object onto subscription items; older API versions still
 * carry them top-level. Try the item first, fall back to the legacy fields
 * so the reducer stays compatible with both.
 */
function extractPeriods(sub: Stripe.Subscription): { start: number; end: number } {
  const item = sub.items.data[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = item?.current_period_start ?? legacy.current_period_start ?? 0;
  const end = item?.current_period_end ?? legacy.current_period_end ?? 0;
  return { start, end };
}
