import type Stripe from 'stripe';

/**
 * Names of fixture events planned for the bundled fixture corpus. The type
 * is exported now so consumers can wire their own loader against the same
 * keys the bundled `loadFixture` will accept once the corpus ships.
 */
export type FixtureName =
  | 'checkoutSessionCompleted'
  | 'subscriptionCreated'
  | 'subscriptionUpdated'
  | 'invoicePaymentFailed';

/** Map a fixture name to its precisely-typed Stripe event. */
export type FixtureOf<N extends FixtureName> = {
  checkoutSessionCompleted: Stripe.Event & { type: 'checkout.session.completed' };
  subscriptionCreated: Stripe.Event & { type: 'customer.subscription.created' };
  subscriptionUpdated: Stripe.Event & { type: 'customer.subscription.updated' };
  invoicePaymentFailed: Stripe.Event & { type: 'invoice.payment_failed' };
}[N];

// `loadFixture` is intentionally NOT exported in 0.1.x — the bundled fixture
// payloads land in a follow-up release. Capture your own with
// `stripe listen --print-json > fixture.json` and import the JSON directly
// in the meantime. The `FixtureName` / `FixtureOf` types above let you wire
// a local loader against the same keys the eventual `loadFixture` will use.
