/**
 * Default TTL (seconds) for the **commit** marker — the long-lived "this
 * event id was processed" record. Sized to outlive Stripe's 3-day retry
 * window with margin (7 days).
 */
export const DEFAULT_COMMIT_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Default TTL (seconds) for the **claim** marker — the short-lived
 * "in-flight on this worker" record. Should exceed worst-case handler
 * runtime; raise it if your handler can run longer than 60s.
 */
export const DEFAULT_CLAIM_TTL_SECONDS = 60;
