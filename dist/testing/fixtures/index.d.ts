import Stripe from 'stripe';

/** Names of fixture events shipped (or planned to ship) with the library. */
type FixtureName = 'checkoutSessionCompleted' | 'subscriptionCreated' | 'subscriptionUpdated' | 'invoicePaymentFailed';
/** Map a fixture name to its precisely-typed Stripe event. */
type FixtureOf<N extends FixtureName> = {
    checkoutSessionCompleted: Stripe.Event & {
        type: 'checkout.session.completed';
    };
    subscriptionCreated: Stripe.Event & {
        type: 'customer.subscription.created';
    };
    subscriptionUpdated: Stripe.Event & {
        type: 'customer.subscription.updated';
    };
    invoicePaymentFailed: Stripe.Event & {
        type: 'invoice.payment_failed';
    };
}[N];
/**
 * Lazy-load a captured Stripe event fixture by name. Each fixture is its
 * own dynamic import, so calling `loadFixture('subscriptionCreated')` does
 * not pull the others into the bundle.
 *
 * NOTE: real fixture payloads ship in a follow-up release — this 0.1.0 cut
 * publishes the loader signature so callers can wire it up against their
 * own captured payloads (e.g. via `stripe listen --print-json`) without
 * waiting for the bundled JSON.
 *
 * @param name - The fixture name to load.
 * @returns A precisely-typed Stripe event matching `name`.
 * @throws {Error} On 0.1.0 — fixtures land later. Capture your own with
 *         `stripe listen --print-json > fixture.json` and import the JSON
 *         directly in the meantime.
 */
declare function loadFixture<N extends FixtureName>(_name: N): Promise<FixtureOf<N>>;

export { type FixtureName, type FixtureOf, loadFixture };
