import Stripe from 'stripe';

/**
 * Subset of Stripe event names this library treats as first-class. These
 * are the event types the dispatcher narrows precisely; any other Stripe
 * event still flows through `dispatcher.onAny`.
 *
 * Kept as a closed literal union (not derived from `Stripe.Event['type']`)
 * so the public API remains stable across Stripe SDK upgrades — the SDK
 * adding a new event won't silently widen our typed surface.
 */
type StripeEventName = 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted' | 'customer.subscription.trial_will_end' | 'customer.subscription.paused' | 'customer.subscription.resumed' | 'invoice.created' | 'invoice.paid' | 'invoice.payment_failed' | 'invoice.payment_succeeded' | 'invoice.upcoming' | 'checkout.session.completed' | 'checkout.session.expired';
/**
 * Pick the precisely-typed branch of `Stripe.Event` for a given event name.
 * `data.object` is then narrowed to (e.g.) `Stripe.Subscription` — no casts
 * required at the call site.
 */
type StripeEventOf<N extends Stripe.Event['type']> = Extract<Stripe.Event, {
    type: N;
}>;

export type { StripeEventName as S, StripeEventOf as a };
