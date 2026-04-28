import { IdempotencyStore } from '../storage/memory/index.js';
export { ClaimState, createMemoryStore } from '../storage/memory/index.js';

/**
 * Outcome of {@link withIdempotency}:
 *  - `{ ran: true, value }` — handler executed and committed.
 *  - `{ ran: false, reason: 'duplicate' }`  — already committed; skipped.
 *  - `{ ran: false, reason: 'in-flight' }`  — another worker holds the claim; skipped.
 */
type WithIdempotencyResult<T> = {
    ran: true;
    value: T;
} | {
    ran: false;
    reason: 'duplicate' | 'in-flight';
};
/**
 * Wrap a function with the two-phase claim/commit de-duplication protocol.
 *
 * Behaviour:
 *  - `claim` returns `'claimed'`   → run `fn`; `commit` on success;
 *                                    `release` on throw and re-throw the original error.
 *  - `claim` returns `'committed'` → SKIP `fn`; return `{ ran: false, reason: 'duplicate' }`.
 *  - `claim` returns `'in-flight'` → SKIP `fn`; return `{ ran: false, reason: 'in-flight' }`.
 *
 * Caller (typically `createWebhookHandler`) maps these to HTTP status:
 *   `claimed` + commit success → 200
 *   `committed` (duplicate)    → 200 (Stripe stops retrying)
 *   `in-flight`                → 425 / 5xx (Stripe will retry)
 *   handler throws             → `release`, then 5xx
 *
 * @param store - The idempotency store implementation to use.
 * @param key   - The de-duplication key (typically `stripe:event:${event.id}`).
 * @param fn    - The function to run if the claim succeeds.
 * @param opts.claimTtlSeconds  - TTL for the in-flight marker (default 60s).
 * @param opts.commitTtlSeconds - TTL for the committed marker (default 7 days).
 * @returns The {@link WithIdempotencyResult} describing what happened.
 * @throws Re-throws any error from `fn` (after calling `store.release`).
 *
 * @example
 * ```ts
 * const r = await withIdempotency(store, `stripe:event:${event.id}`, async () => {
 *   await db.processSubscription(event);
 * });
 * if (!r.ran) log('skipped', r.reason);
 * ```
 */
declare function withIdempotency<T>(store: IdempotencyStore, key: string, fn: () => Promise<T>, opts?: {
    claimTtlSeconds?: number;
    commitTtlSeconds?: number;
}): Promise<WithIdempotencyResult<T>>;

/**
 * Default TTL (seconds) for the **commit** marker — the long-lived "this
 * event id was processed" record. Sized to outlive Stripe's 3-day retry
 * window with margin (7 days).
 */
declare const DEFAULT_COMMIT_TTL_SECONDS: number;
/**
 * Default TTL (seconds) for the **claim** marker — the short-lived
 * "in-flight on this worker" record. Should exceed worst-case handler
 * runtime; raise it if your handler can run longer than 60s.
 */
declare const DEFAULT_CLAIM_TTL_SECONDS = 60;

export { DEFAULT_CLAIM_TTL_SECONDS, DEFAULT_COMMIT_TTL_SECONDS, IdempotencyStore, type WithIdempotencyResult, withIdempotency };
