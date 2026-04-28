import type { SubscriptionState } from './reducer.js';
import type { SubscriptionStatus } from './status.js';

/** Context passed to a registered transition effect. */
export interface TransitionContext<
  From extends SubscriptionStatus = SubscriptionStatus,
  To extends SubscriptionStatus = SubscriptionStatus,
> {
  /** The status the subscription is leaving. */
  from: From;
  /** The status the subscription is entering. */
  to: To;
  /** The post-transition subscription projection. */
  subscription: SubscriptionState;
}

/** Internal storage shape — every effect is stored under the wider context. */
type Effect = (ctx: TransitionContext) => Promise<void> | void;

/**
 * Per-instance transition router. Each call to {@link createTransitionRouter}
 * returns an independent router; tests need no `reset()` and apps with two
 * Stripe accounts can keep their effects isolated.
 */
export interface TransitionRouter {
  /**
   * Register an effect for a specific `(From, To)` transition. Effects are
   * typed by the exact pair so `trialing → active` cannot accidentally fire
   * for a `past_due → active` recovery.
   *
   * @param from   - The status the subscription is leaving.
   * @param to     - The status the subscription is entering.
   * @param effect - The side-effect to run when this transition occurs.
   * @returns The same router (for chaining).
   */
  on<From extends SubscriptionStatus, To extends SubscriptionStatus>(
    from: From,
    to: To,
    effect: (ctx: TransitionContext<From, To>) => Promise<void> | void,
  ): TransitionRouter;

  /**
   * Run every effect whose `(from, to)` matches `ctx`. Effects fire in
   * registration order. No-op if none match.
   *
   * @param ctx - The transition context.
   */
  run(ctx: {
    from: SubscriptionStatus;
    to: SubscriptionStatus;
    subscription: SubscriptionState;
  }): Promise<void>;
}

/**
 * Create a fresh, empty {@link TransitionRouter}. Replaces the previous
 * module-level free function — that design hid mutable state inside an
 * otherwise stateless library and made multi-account setups effectively
 * impossible.
 *
 * @returns A new {@link TransitionRouter}.
 *
 * @example
 * ```ts
 * const router = createTransitionRouter()
 *   .on('trialing', 'active', async ({ subscription }) => {
 *     await sendWelcomeEmail(subscription.customerId);
 *   })
 *   .on('past_due', 'canceled', async ({ subscription }) => {
 *     await downgradeToFree(subscription.customerId);
 *   });
 *
 * await router.run({ from: prev.status, to: next.status, subscription: next });
 * ```
 */
export function createTransitionRouter(): TransitionRouter {
  const effects = new Map<string, Effect[]>();
  const key = (from: SubscriptionStatus, to: SubscriptionStatus): string => `${from}→${to}`;

  const router: TransitionRouter = {
    on(from, to, effect) {
      const k = key(from, to);
      const arr = effects.get(k) ?? [];
      // Cast: a `(ctx: TransitionContext<From, To>) => …` is contravariantly
      // narrower than the stored `Effect` signature. Runtime contract: the
      // dispatch in `run()` only invokes effects whose registered key matches
      // `ctx.from`/`ctx.to`, so the widened storage type is sound.
      arr.push(effect as unknown as Effect);
      effects.set(k, arr);
      return router;
    },
    async run(ctx) {
      const arr = effects.get(key(ctx.from, ctx.to));
      if (arr === undefined) return;
      for (const effect of arr) {
        await effect(ctx);
      }
    },
  };
  return router;
}
