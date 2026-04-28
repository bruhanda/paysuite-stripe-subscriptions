/**
 * Stable, programmatic error codes emitted by every {@link PaySuiteError}.
 * The `as const` shape gives both an iterable runtime object and a closed
 * literal union via `(typeof ErrorCodes)[keyof typeof ErrorCodes]` — code
 * paths can switch on the union exhaustively.
 *
 * The plural `ErrorCodes` is the runtime const; the singular `ErrorCode` is
 * the type. Same-name const-and-type is legal but tooling-hostile (tripping
 * up auto-import, refactor-rename, and doc generators).
 */
export const ErrorCodes = {
  INVALID_SIGNATURE_FORMAT: 'INVALID_SIGNATURE_FORMAT',
  SIGNATURE_TIMESTAMP_TOO_OLD: 'SIGNATURE_TIMESTAMP_TOO_OLD',
  SIGNATURE_TIMESTAMP_IN_FUTURE: 'SIGNATURE_TIMESTAMP_IN_FUTURE',
  SIGNATURE_MISMATCH: 'SIGNATURE_MISMATCH',
  MISSING_SECRET: 'MISSING_SECRET',
  MALFORMED_PAYLOAD: 'MALFORMED_PAYLOAD',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  UNKNOWN_PRICE_ID: 'UNKNOWN_PRICE_ID',
  STORE_UNAVAILABLE: 'STORE_UNAVAILABLE',
  HANDLER_FAILED: 'HANDLER_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
} as const;

/** Closed literal union of every {@link ErrorCodes} value. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
