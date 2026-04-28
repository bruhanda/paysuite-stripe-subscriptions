import type Stripe from 'stripe';
import type { StripeEventName, StripeEventOf } from './types.js';

/** Untyped catch-all handler signature used by `onAny` and internal storage. */
type AnyHandler = (event: Stripe.Event) => Promise<void> | void;

/** Internal immutable state of a builder instance. */
interface DispatcherInternals {
  readonly handlers: ReadonlyMap<string, AnyHandler>;
  readonly anyHandlers: ReadonlyArray<AnyHandler>;
}

/**
 * Builder for a type-safe event dispatcher. Every `.on()` returns a *new*
 * dispatcher whose phantom `Registered` parameter accumulates the registered
 * event names — re-registration of the same event is a compile error.
 *
 * Dispatch is intentionally *not* a method on the builder. Call `.build()`
 * to seal the registration surface and obtain a {@link SealedDispatcher},
 * which is what {@link createWebhookHandler} accepts.
 */
export interface EventDispatcher<Registered extends StripeEventName = never> {
  /**
   * Register a typed handler for a specific event. The handler's `event`
   * parameter is narrowed to `StripeEventOf<Name>`, so e.g. accessing
   * `event.data.object` returns `Stripe.Subscription` for a
   * `customer.subscription.updated` registration.
   *
   * Re-registering an event already in `Registered` is a compile error —
   * use `onAny` for catch-all behaviour instead.
   */
  on<Name extends Exclude<StripeEventName, Registered>>(
    name: Name,
    handler: (event: StripeEventOf<Name>) => Promise<void> | void,
  ): EventDispatcher<Registered | Name>;

  /**
   * Register a fallback handler invoked for *every* dispatched event,
   * after any matching typed handler has run. Multiple `onAny` handlers
   * compose in registration order.
   *
   * NOTE: `onAny` handlers do **not** run if the typed handler throws —
   * dispatch propagates the typed-handler error directly to the caller so
   * the wrapping idempotency guard can `release` and Stripe can retry.
   * This means `onAny` is a useful telemetry surface for *successful*
   * deliveries but not a reliable place for catch-all error logging.
   */
  onAny(handler: AnyHandler): EventDispatcher<Registered>;

  /** Seal the builder. The returned dispatcher is what the webhook handler accepts. */
  build(): SealedDispatcher<Registered>;
}

/**
 * Sealed dispatcher: registration is closed, dispatch is available.
 * Returned exclusively by {@link EventDispatcher.build}.
 */
export interface SealedDispatcher<Registered extends StripeEventName = never> {
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
export function createDispatcher(): EventDispatcher<never> {
  return makeDispatcher<never>({ handlers: new Map(), anyHandlers: [] });
}

function makeDispatcher<Registered extends StripeEventName>(
  internals: DispatcherInternals,
): EventDispatcher<Registered> {
  return {
    on<Name extends Exclude<StripeEventName, Registered>>(
      name: Name,
      handler: (event: StripeEventOf<Name>) => Promise<void> | void,
    ): EventDispatcher<Registered | Name> {
      const next = new Map(internals.handlers);
      // Cast: TypedHandler<Name> is contravariantly incompatible with the
      // wider `AnyHandler` parameter. Runtime contract: we only invoke
      // `handler` from `dispatch` when `event.type === name`, so storing
      // it under the wider parameter type is sound.
      next.set(name, handler as unknown as AnyHandler);
      return makeDispatcher<Registered | Name>({
        handlers: next,
        anyHandlers: internals.anyHandlers,
      });
    },
    onAny(handler) {
      return makeDispatcher<Registered>({
        handlers: internals.handlers,
        anyHandlers: [...internals.anyHandlers, handler],
      });
    },
    build() {
      const handlers = new Map(internals.handlers);
      const anyHandlers = [...internals.anyHandlers];
      // Cast: keys were inserted via `.on(name, …)` whose `Name extends
      // Exclude<StripeEventName, Registered>`. The runtime set therefore
      // contains exactly the `Registered` literal union.
      const registered = new Set(handlers.keys()) as unknown as ReadonlySet<Registered>;
      return {
        registered,
        async dispatch(event: Stripe.Event): Promise<void> {
          const typed = handlers.get(event.type);
          if (typed !== undefined) await typed(event);
          for (const any of anyHandlers) await any(event);
        },
      };
    },
  };
}
