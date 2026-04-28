import Stripe from 'stripe';
import { S as StripeEventName, a as StripeEventOf } from '../types-CZB0aC31.js';
import { W as WebhookSecret } from '../verifier-aT3XGMEv.js';
import { IdempotencyStore } from '../storage/memory/index.js';
import '../errors/index.js';
import '../base-D1ly21Is.js';

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
declare function buildSubscription(overrides?: Partial<Stripe.Subscription>): Stripe.Subscription;
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
declare function buildEvent<N extends StripeEventName>(type: N, object: StripeEventOf<N>['data']['object'], overrides?: Partial<Stripe.Event>): StripeEventOf<N>;

/**
 * Produce a valid `Stripe-Signature` header for an arbitrary payload —
 * useful for unit-testing your webhook handler without spinning up
 * `stripe listen`. Implementation matches Stripe's documented algorithm
 * exactly, so a header from this function is interchangeable with the
 * real thing for the corresponding payload + secret.
 *
 * @param opts.secret    - The webhook signing secret to use.
 * @param opts.payload   - The body to sign, as bytes or a string (UTF-8 encoded).
 * @param opts.timestamp - Optional fixed timestamp (unix seconds). Defaults to `now`.
 * @returns A header value of the form `t=<unix>,v1=<hex-mac>`.
 *
 * @example
 * ```ts
 * const header = await signPayload({
 *   secret: 'whsec_test',
 *   payload: JSON.stringify(event),
 * });
 * const r = await verifyStripeSignature({ payload: encodeUtf8(JSON.stringify(event)), header, secret: 'whsec_test' });
 * ```
 */
declare function signPayload(opts: {
    secret: WebhookSecret;
    payload: string | Uint8Array;
    timestamp?: number;
}): Promise<string>;

/** A single recorded interaction with a {@link createSpyStore}. */
interface SpyCall {
    method: 'claim' | 'commit' | 'release' | 'delete';
    key: string;
}
/** A spy-able {@link IdempotencyStore} with a recorded call log. */
type SpyStore = IdempotencyStore & {
    /** Append-only log of calls, oldest-first. */
    readonly calls: ReadonlyArray<SpyCall>;
    /** Clear the call log; the underlying store data is also reset. */
    reset(): void;
};
/**
 * Create a spy-able {@link IdempotencyStore} that records every call to
 * `claim` / `commit` / `release` / `delete` and delegates to an in-memory
 * store. Useful for asserting duplicate handling and retry behavior in
 * unit tests.
 *
 * @returns A {@link SpyStore} with a `.calls` log and `.reset()` method.
 *
 * @example
 * ```ts
 * const store = createSpyStore();
 * await handler(request);
 * expect(store.calls).toEqual([
 *   { method: 'claim', key: 'stripe:event:evt_1' },
 *   { method: 'commit', key: 'stripe:event:evt_1' },
 * ]);
 * ```
 */
declare function createSpyStore(): SpyStore;

/**
 * In-memory pub/sub between captured `stripe listen --print-json` events
 * and your test assertions. The bridge does not spawn the CLI itself —
 * users feed events through `push()` from whatever transport they prefer
 * (a tail of the CLI's stdout, a fixture replay, ...).
 */
interface CliBridge {
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
declare function createCliBridge(): CliBridge;

export { type CliBridge, type SpyCall, type SpyStore, buildEvent, buildSubscription, createCliBridge, createSpyStore, signPayload };
