import { R as Result } from '../result-26Z0l6MF.js';
import { InvalidTransitionError } from '../errors/index.js';
import { a as StripeEventOf } from '../types-CZB0aC31.js';
import '../base-D1ly21Is.js';
import 'stripe';

/**
 * All Stripe subscription statuses, mirrored verbatim from the Stripe API.
 * Kept as a closed literal union so consumers can switch exhaustively.
 *
 * If Stripe introduces a new status, the {@link reduceSubscription} reducer
 * passes it through with a structured warning rather than throwing — see
 * §9.3 #16 in PLAN.md.
 */
type SubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
/**
 * Iterable runtime list of every {@link SubscriptionStatus}. Useful for
 * generating UI option lists and exhaustive test matrices.
 */
declare const SUBSCRIPTION_STATUSES: ReadonlyArray<SubscriptionStatus>;

/**
 * Static, frozen table of allowed status transitions, derived from Stripe's
 * documented behaviour. Source of truth for {@link validateSubscriptionTransition}.
 */
declare const VALID_TRANSITIONS: Readonly<Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>>>;
/**
 * Validate a status transition against {@link VALID_TRANSITIONS}. Pure — no
 * side effects. Same-status transitions (`active → active`) are always
 * allowed: webhooks may legitimately fire for non-status-changing updates
 * (e.g. metadata changes).
 *
 * Named `validateSubscriptionTransition` (not `transition`) to avoid auto-
 * import collisions with the many user-land `transition()` helpers in
 * routing and animation libraries.
 *
 * @param from - The current status.
 * @param to   - The candidate next status.
 * @returns `Ok({ from, to })` when the transition is allowed; otherwise
 *          `Err(InvalidTransitionError)` with code `INVALID_TRANSITION`.
 *
 * @example
 * ```ts
 * const r = validateSubscriptionTransition('trialing', 'active');
 * if (r.ok) await persist(r.value);
 * ```
 */
declare function validateSubscriptionTransition(from: SubscriptionStatus, to: SubscriptionStatus): Result<{
    from: SubscriptionStatus;
    to: SubscriptionStatus;
}, InvalidTransitionError>;

/**
 * The minimal, persistence-ready projection of a Stripe subscription that
 * this library cares about. Designed to be pasted into your DB schema with
 * minimal fuss — every field is a primitive (no nested Stripe objects).
 */
interface SubscriptionState {
    /** Stripe subscription id (`sub_…`). */
    id: string;
    /** Stripe customer id (`cus_…`). */
    customerId: string;
    /** Current Stripe status — see {@link SubscriptionStatus}. */
    status: SubscriptionStatus;
    /**
     * Active price id; for multi-item subscriptions, the *first* item's price.
     * `null` when the subscription has no items (a malformed input we surface
     * rather than masking with an empty string — feature lookups against `''`
     * would otherwise silently treat the price as "unknown plan").
     */
    priceId: string | null;
    /** Unix-seconds of the current period start. */
    currentPeriodStart: number;
    /** Unix-seconds of the current period end. */
    currentPeriodEnd: number;
    /** Whether cancellation is queued for end-of-period. */
    cancelAtPeriodEnd: boolean;
    /** Unix-seconds when the trial ends (or `null` if there is no trial). */
    trialEnd: number | null;
    /** Unix-seconds — high-water mark for out-of-order webhook detection. */
    updatedAt: number;
}
/** The set of events accepted by {@link reduceSubscription}. */
type ReducibleSubscriptionEvent = StripeEventOf<'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted'>;
/**
 * Pure event-sourced reducer. Derives the next {@link SubscriptionState}
 * from the previous state (or `null` on first-seen) and a Stripe event.
 * Drops out-of-order events (where `event.created < prev.updatedAt`) so
 * that Stripe's unordered delivery cannot regress local state.
 *
 * Same-second tie-breaking: Stripe's `event.created` has 1-second
 * resolution, so two genuinely-distinct events emitted in the same second
 * can arrive in either order. The reducer treats `event.created ===
 * prev.updatedAt` as "apply" (the second event in the same second wins),
 * trading rare duplicate application for never-skipping a real update.
 * Persistence layers that need stricter monotonicity should compare on a
 * server-provided sequence number instead.
 *
 * Named `reduceSubscription` to avoid auto-import collisions with
 * `Array.prototype.reduce` and Redux conventions.
 *
 * @param prev  - Previous projection, or `null` for the first event.
 * @param event - One of the customer.subscription.* events.
 * @returns The next {@link SubscriptionState}; if the event is stale
 *          relative to `prev`, `prev` is returned unchanged.
 *
 * @example
 * ```ts
 * const next = reduceSubscription(prev, event);
 * await db.upsertSubscription(next);
 * ```
 */
declare function reduceSubscription(prev: SubscriptionState | null, event: ReducibleSubscriptionEvent): SubscriptionState;

/** Context passed to a registered transition effect. */
interface TransitionContext<From extends SubscriptionStatus = SubscriptionStatus, To extends SubscriptionStatus = SubscriptionStatus> {
    /** The status the subscription is leaving. */
    from: From;
    /** The status the subscription is entering. */
    to: To;
    /** The post-transition subscription projection. */
    subscription: SubscriptionState;
}
/**
 * Per-instance transition router. Each call to {@link createTransitionRouter}
 * returns an independent router; tests need no `reset()` and apps with two
 * Stripe accounts can keep their effects isolated.
 */
interface TransitionRouter {
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
    on<From extends SubscriptionStatus, To extends SubscriptionStatus>(from: From, to: To, effect: (ctx: TransitionContext<From, To>) => Promise<void> | void): TransitionRouter;
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
declare function createTransitionRouter(): TransitionRouter;

export { type ReducibleSubscriptionEvent, SUBSCRIPTION_STATUSES, type SubscriptionState, type SubscriptionStatus, type TransitionContext, type TransitionRouter, VALID_TRANSITIONS, createTransitionRouter, reduceSubscription, validateSubscriptionTransition };
