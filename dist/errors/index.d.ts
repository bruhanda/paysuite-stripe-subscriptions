import { P as PaySuiteError, a as PaySuiteErrorOptions } from '../base-D1ly21Is.js';
export { E as ErrorCode, b as ErrorCodes, c as PaySuiteErrorJSON } from '../base-D1ly21Is.js';

/**
 * Thrown by webhook signature verification when the header is malformed,
 * the timestamp is outside the configured tolerance, or the computed HMAC
 * does not match any `v1=…` segment in the header. Always returned via
 * `Result.err` — never `throw`n — by {@link verifyStripeSignature}.
 *
 * Codes: `INVALID_SIGNATURE_FORMAT`, `SIGNATURE_TIMESTAMP_TOO_OLD`,
 * `SIGNATURE_TIMESTAMP_IN_FUTURE`, `SIGNATURE_MISMATCH`,
 * `MALFORMED_PAYLOAD`.
 */
declare class SignatureVerificationError extends PaySuiteError {
    constructor(opts: PaySuiteErrorOptions);
}
/**
 * Thrown when a status transition violates the table in
 * `state-machine/transitions.ts`. Code: `INVALID_TRANSITION`.
 */
declare class InvalidTransitionError extends PaySuiteError {
    constructor(opts: PaySuiteErrorOptions);
}
/**
 * Thrown for caller-supplied configuration that cannot possibly be valid:
 * missing webhook secret, raw object passed where a `definePlans()`-branded
 * config is required, etc. Failure is loud at handler-construction time —
 * not deferred to the first request.
 *
 * Codes: `CONFIG_INVALID`, `MISSING_SECRET`, `UNKNOWN_PRICE_ID`.
 */
declare class ConfigError extends PaySuiteError {
    constructor(opts: PaySuiteErrorOptions);
}
/**
 * Thrown when an idempotency store cannot be reached or returns an
 * unexpected response. Bubbles to the framework adapter so Stripe sees a
 * 5xx and retries. Code: `STORE_UNAVAILABLE`.
 */
declare class StoreError extends PaySuiteError {
    constructor(opts: PaySuiteErrorOptions);
}
/**
 * Wraps an error thrown from a user-registered handler. Preserves the
 * original via `cause`. Code: `HANDLER_FAILED`.
 */
declare class HandlerError extends PaySuiteError {
    constructor(opts: PaySuiteErrorOptions);
}

export { ConfigError, HandlerError, InvalidTransitionError, PaySuiteError, PaySuiteErrorOptions, SignatureVerificationError, StoreError };
