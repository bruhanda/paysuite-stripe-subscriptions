import type Stripe from 'stripe';
import type { StripeEventName, StripeEventOf } from '../events/types.js';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Defaults applied by {@link buildSubscription} before overrides. */
const SUBSCRIPTION_DEFAULTS = {
  id: 'sub_test_default',
  object: 'subscription',
  status: 'active',
  customer: 'cus_test_default',
  cancel_at_period_end: false,
  collection_method: 'charge_automatically',
  livemode: false,
  metadata: {},
  trial_end: null,
  trial_start: null,
} as const;

/**
 * Build a structurally-valid `Stripe.Subscription` for unit tests. Only the
 * subset of fields touched by this library's public APIs is populated by
 * default — pass `overrides` to fill in anything else your test reads.
 *
 * @param overrides - Partial subscription fields to merge over the defaults.
 * @returns A `Stripe.Subscription` suitable for feeding into reducers and
 *          dispatchers.
 *
 * @example
 * ```ts
 * const sub = buildSubscription({ status: 'past_due' });
 * ```
 */
export function buildSubscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  const periodStart = nowSeconds();
  const periodEnd = periodStart + 30 * 24 * 3600;
  const base = {
    ...SUBSCRIPTION_DEFAULTS,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    items: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/subscription_items',
    },
  };
  // Cast: the Stripe.Subscription type has many additional fields the
  // tests neither set nor read; the structural subset above is sufficient
  // for every public API of this library.
  return { ...base, ...overrides } as unknown as Stripe.Subscription;
}

/**
 * Build a structurally-valid `Stripe.Event` of a given type with an
 * embedded `data.object`. The result is precisely typed via
 * {@link StripeEventOf} so dispatcher tests can assert on payload shape.
 *
 * @param type      - The event type, e.g. `'customer.subscription.updated'`.
 * @param object    - The pre-built `data.object` value.
 * @param overrides - Optional event-level overrides (`id`, `created`, ...).
 * @returns A typed `Stripe.Event` you can feed into a dispatcher.
 *
 * @example
 * ```ts
 * const event = buildEvent(
 *   'customer.subscription.updated',
 *   buildSubscription({ status: 'past_due' }),
 * );
 * ```
 */
export function buildEvent<N extends StripeEventName>(
  type: N,
  object: StripeEventOf<N>['data']['object'],
  overrides: Partial<Stripe.Event> = {},
): StripeEventOf<N> {
  const base = {
    id: `evt_test_${Math.random().toString(36).slice(2, 10)}`,
    object: 'event' as const,
    api_version: '2024-12-18.acacia',
    created: nowSeconds(),
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    ...overrides,
  };
  // Cast: see buildSubscription — Stripe.Event has many fields we leave
  // unset; the typed return is the contract.
  return base as unknown as StripeEventOf<N>;
}
