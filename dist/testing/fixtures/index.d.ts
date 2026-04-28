import Stripe from 'stripe';

/**
 * Names of fixture events planned for the bundled fixture corpus. The type
 * is exported now so consumers can wire their own loader against the same
 * keys the bundled `loadFixture` will accept once the corpus ships.
 */
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

export type { FixtureName, FixtureOf };
