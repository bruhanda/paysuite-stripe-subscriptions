export { S as StripeEventName, a as StripeEventOf } from '../types-CZB0aC31.js';
export { E as EventDispatcher, S as SealedDispatcher, c as createDispatcher } from '../dispatcher-CzqR098A.js';
import Stripe from 'stripe';

/**
 * Type guard: narrow a Stripe event to any `customer.subscription.*` event.
 *
 * @param event - The event to inspect.
 * @returns `true` iff `event.type` starts with `customer.subscription.`.
 *
 * @example
 * ```ts
 * if (isSubscriptionEvent(event)) {
 *   // event.data.object is typed precisely (Stripe.Subscription) here.
 * }
 * ```
 */
declare function isSubscriptionEvent(event: Stripe.Event): event is Extract<Stripe.Event, {
    type: `customer.subscription.${string}`;
}>;
/**
 * Type guard: narrow a Stripe event to any `invoice.*` event.
 *
 * @param event - The event to inspect.
 * @returns `true` iff `event.type` starts with `invoice.`.
 */
declare function isInvoiceEvent(event: Stripe.Event): event is Extract<Stripe.Event, {
    type: `invoice.${string}`;
}>;
/**
 * Type guard: narrow a Stripe event to any `checkout.session.*` event.
 *
 * @param event - The event to inspect.
 * @returns `true` iff `event.type` starts with `checkout.session.`.
 */
declare function isCheckoutSessionEvent(event: Stripe.Event): event is Extract<Stripe.Event, {
    type: `checkout.session.${string}`;
}>;

export { isCheckoutSessionEvent, isInvoiceEvent, isSubscriptionEvent };
