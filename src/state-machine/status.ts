/**
 * All Stripe subscription statuses, mirrored verbatim from the Stripe API.
 * Kept as a closed literal union so consumers can switch exhaustively.
 *
 * If Stripe introduces a new status, the {@link reduceSubscription} reducer
 * passes it through with a structured warning rather than throwing — see
 * §9.3 #16 in PLAN.md.
 */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/**
 * Iterable runtime list of every {@link SubscriptionStatus}. Useful for
 * generating UI option lists and exhaustive test matrices.
 */
export const SUBSCRIPTION_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
];
