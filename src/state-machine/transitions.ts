import { type Result, err, ok } from '../core/result.js';
import { ErrorCodes } from '../errors/codes.js';
import { InvalidTransitionError } from '../errors/index.js';
import type { SubscriptionStatus } from './status.js';

const TRANSITIONS = {
  incomplete: ['active', 'trialing', 'incomplete_expired', 'canceled'],
  incomplete_expired: [],
  trialing: ['active', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete_expired'],
  active: ['past_due', 'canceled', 'unpaid', 'paused', 'trialing'],
  past_due: ['active', 'canceled', 'unpaid'],
  canceled: [],
  unpaid: ['active', 'canceled', 'past_due'],
  paused: ['active', 'canceled', 'trialing'],
} as const satisfies Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>>;

/**
 * Static, frozen table of allowed status transitions, derived from Stripe's
 * documented behaviour. Source of truth for {@link validateSubscriptionTransition}.
 */
export const VALID_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>>
> = TRANSITIONS;

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
export function validateSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): Result<{ from: SubscriptionStatus; to: SubscriptionStatus }, InvalidTransitionError> {
  if (from === to) return ok({ from, to });
  const allowed = VALID_TRANSITIONS[from];
  if (allowed.includes(to)) return ok({ from, to });
  return err(
    new InvalidTransitionError({
      code: ErrorCodes.INVALID_TRANSITION,
      message: `Transition ${from} → ${to} is not allowed.`,
      details: { from, to },
    }),
  );
}
