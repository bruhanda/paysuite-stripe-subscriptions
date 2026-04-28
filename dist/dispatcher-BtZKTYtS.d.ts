import Stripe from 'stripe';
import { S as StripeEventName, a as StripeEventOf } from './types-CZB0aC31.js';

/** Untyped catch-all handler signature used by `onAny` and internal storage. */
type AnyHandler = (event: Stripe.Event) => Promise<void> | void;
/**
 * Builder for a type-safe event dispatcher. Every `.on()` returns a *new*
 * dispatcher whose phantom `Registered` parameter accumulates the registered
 * event names — re-registration of the same event is a compile error.
 *
 * Dispatch is intentionally *not* a method on the builder. Call `.build()`
 * to seal the registration surface and obtain a {@link SealedDispatcher},
 * which is what {@link createWebhookHandler} accepts.
 */
interface EventDispatcher<Registered extends StripeEventName = never> {
    /**
     * Register a typed handler for a specific event. The handler's `event`
     * parameter is narrowed to `StripeEventOf<Name>`, so e.g. accessing
     * `event.data.object` returns `Stripe.Subscription` for a
     * `customer.subscription.updated` registration.
     *
     * Re-registering an event already in `Registered` is a compile error —
     * use `onAny` for catch-all behaviour instead.
     */
    on<Name extends Exclude<StripeEventName, Registered>>(name: Name, handler: (event: StripeEventOf<Name>) => Promise<void> | void): EventDispatcher<Registered | Name>;
    /**
     * Register a fallback handler invoked for *every* dispatched event,
     * after any matching typed handler has run. Multiple `onAny` handlers
     * compose in registration order.
     */
    onAny(handler: AnyHandler): EventDispatcher<Registered>;
    /** Seal the builder. The returned dispatcher is what the webhook handler accepts. */
    build(): SealedDispatcher<Registered>;
}
/**
 * Sealed dispatcher: registration is closed, dispatch is available.
 * Returned exclusively by {@link EventDispatcher.build}.
 */
interface SealedDispatcher<Registered extends StripeEventName = never> {
    /**
     * Route an event to the registered typed handler (if any) and to every
     * `onAny` handler. Returns once all handlers have settled.
     */
    dispatch(event: Stripe.Event): Promise<void>;
    /**
     * Compile-time set of registered event names — exposed for callers that
     * want to assert exhaustiveness against an external "must-handle" list.
     */
    readonly registered: ReadonlySet<Registered>;
}
/**
 * Build a type-safe event router. Handlers receive precisely-narrowed Stripe
 * event payloads — no manual casting at the call site.
 *
 * @returns A fresh, empty {@link EventDispatcher}.
 *
 * @example
 * ```ts
 * const dispatcher = createDispatcher()
 *   .on('customer.subscription.updated', async (event) => {
 *     // event.data.object is Stripe.Subscription, fully typed.
 *     console.log(event.data.object.status);
 *   })
 *   .onAny((event) => log('saw', event.type))
 *   .build();
 * ```
 */
declare function createDispatcher(): EventDispatcher<never>;

export { type EventDispatcher as E, type SealedDispatcher as S, createDispatcher as c };
