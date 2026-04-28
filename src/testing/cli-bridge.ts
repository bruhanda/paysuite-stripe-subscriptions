import type Stripe from 'stripe';

/**
 * In-memory pub/sub between captured `stripe listen --print-json` events
 * and your test assertions. The bridge does not spawn the CLI itself —
 * users feed events through `push()` from whatever transport they prefer
 * (a tail of the CLI's stdout, a fixture replay, ...).
 */
export interface CliBridge {
  /** Subscribe to events. Multiple listeners are allowed. */
  onEvent(handler: (event: Stripe.Event) => void): void;
  /** Publish an event to all subscribers. */
  push(event: Stripe.Event): void;
}

/**
 * Create an in-memory {@link CliBridge}. Designed for tests that want to
 * exercise dispatchers against fixture events without a network round-trip
 * to Stripe's CLI.
 *
 * @returns A fresh {@link CliBridge}.
 *
 * @example
 * ```ts
 * const bridge = createCliBridge();
 * bridge.onEvent(dispatcher.dispatch);
 * bridge.push(await loadFixture('subscriptionUpdated'));
 * ```
 */
export function createCliBridge(): CliBridge {
  const listeners: Array<(event: Stripe.Event) => void> = [];
  return {
    onEvent(handler) {
      listeners.push(handler);
    },
    push(event) {
      for (const listener of listeners) listener(event);
    },
  };
}
