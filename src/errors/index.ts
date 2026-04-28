import { PaySuiteError, type PaySuiteErrorOptions } from './base.js';

export { ErrorCodes, type ErrorCode } from './codes.js';
export { PaySuiteError, type PaySuiteErrorOptions, type PaySuiteErrorJSON } from './base.js';

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
export class SignatureVerificationError extends PaySuiteError {
  constructor(opts: PaySuiteErrorOptions) {
    super(opts);
    this.name = 'SignatureVerificationError';
  }
}

/**
 * Thrown when a status transition violates the table in
 * `state-machine/transitions.ts`. Code: `INVALID_TRANSITION`.
 */
export class InvalidTransitionError extends PaySuiteError {
  constructor(opts: PaySuiteErrorOptions) {
    super(opts);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Thrown for caller-supplied configuration that cannot possibly be valid:
 * missing webhook secret, raw object passed where a `definePlans()`-branded
 * config is required, etc. Failure is loud at handler-construction time —
 * not deferred to the first request.
 *
 * Codes: `CONFIG_INVALID`, `MISSING_SECRET`, `UNKNOWN_PRICE_ID`.
 */
export class ConfigError extends PaySuiteError {
  constructor(opts: PaySuiteErrorOptions) {
    super(opts);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when an idempotency store cannot be reached or returns an
 * unexpected response. Bubbles to the framework adapter so Stripe sees a
 * 5xx and retries. Code: `STORE_UNAVAILABLE`.
 */
export class StoreError extends PaySuiteError {
  constructor(opts: PaySuiteErrorOptions) {
    super(opts);
    this.name = 'StoreError';
  }
}

/**
 * Wraps an error thrown from a user-registered handler. Preserves the
 * original via `cause`. Code: `HANDLER_FAILED`.
 */
export class HandlerError extends PaySuiteError {
  constructor(opts: PaySuiteErrorOptions) {
    super(opts);
    this.name = 'HandlerError';
  }
}
