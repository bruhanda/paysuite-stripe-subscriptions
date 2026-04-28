import type Stripe from 'stripe';

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
export function isSubscriptionEvent(
  event: Stripe.Event,
): event is Extract<Stripe.Event, { type: `customer.subscription.${string}` }> {
  return event.type.startsWith('customer.subscription.');
}

/**
 * Type guard: narrow a Stripe event to any `invoice.*` event.
 *
 * @param event - The event to inspect.
 * @returns `true` iff `event.type` starts with `invoice.`.
 */
export function isInvoiceEvent(
  event: Stripe.Event,
): event is Extract<Stripe.Event, { type: `invoice.${string}` }> {
  return event.type.startsWith('invoice.');
}

/**
 * Type guard: narrow a Stripe event to any `checkout.session.*` event.
 *
 * @param event - The event to inspect.
 * @returns `true` iff `event.type` starts with `checkout.session.`.
 */
export function isCheckoutSessionEvent(
  event: Stripe.Event,
): event is Extract<Stripe.Event, { type: `checkout.session.${string}` }> {
  return event.type.startsWith('checkout.session.');
}
