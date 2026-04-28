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
declare const ErrorCodes: {
    readonly INVALID_SIGNATURE_FORMAT: "INVALID_SIGNATURE_FORMAT";
    readonly SIGNATURE_TIMESTAMP_TOO_OLD: "SIGNATURE_TIMESTAMP_TOO_OLD";
    readonly SIGNATURE_TIMESTAMP_IN_FUTURE: "SIGNATURE_TIMESTAMP_IN_FUTURE";
    readonly SIGNATURE_MISMATCH: "SIGNATURE_MISMATCH";
    readonly MISSING_SECRET: "MISSING_SECRET";
    readonly MALFORMED_PAYLOAD: "MALFORMED_PAYLOAD";
    readonly INVALID_TRANSITION: "INVALID_TRANSITION";
    readonly UNKNOWN_PRICE_ID: "UNKNOWN_PRICE_ID";
    readonly STORE_UNAVAILABLE: "STORE_UNAVAILABLE";
    readonly HANDLER_FAILED: "HANDLER_FAILED";
    readonly CONFIG_INVALID: "CONFIG_INVALID";
};
/** Closed literal union of every {@link ErrorCodes} value. */
type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Constructor options shared by every {@link PaySuiteError} subclass. */
interface PaySuiteErrorOptions {
    /** Stable programmatic error code — use this, not `message`, for branching. */
    code: ErrorCode;
    /** Human-readable message; safe to surface in logs but not necessarily to end users. */
    message: string;
    /** Optional structured context attached to the error (logged verbatim by sinks). */
    details?: Record<string, unknown>;
    /** Underlying cause, preserved through serialization. */
    cause?: unknown;
}
/** JSON-serializable shape produced by {@link PaySuiteError.toJSON}. */
interface PaySuiteErrorJSON {
    name: string;
    code: ErrorCode;
    message: string;
    details?: Readonly<Record<string, unknown>>;
    cause?: unknown;
}
/**
 * Base class for every error this library emits. Always carries a stable
 * {@link ErrorCode}, optional structured `details`, and a preserved `cause`.
 *
 * Every error is JSON-serializable via {@link PaySuiteError.toJSON} —
 * observability stacks (Sentry, Axiom, ...) can attach the result without a
 * mapping layer.
 *
 * @example
 * ```ts
 * try {
 *   await handler(request);
 * } catch (err) {
 *   if (err instanceof PaySuiteError) {
 *     logger.error('paysuite failure', err.toJSON());
 *   }
 *   throw err;
 * }
 * ```
 */
declare class PaySuiteError extends Error {
    /** Stable programmatic code — see {@link ErrorCode}. */
    readonly code: ErrorCode;
    /** Frozen structured context attached at throw site (when provided). */
    readonly details?: Readonly<Record<string, unknown>>;
    constructor(opts: PaySuiteErrorOptions);
    /**
     * Produce a JSON-serializable snapshot of this error. Recursive `cause`
     * values that are themselves errors are flattened to a `{ name, message }`
     * pair so circular references (e.g. AggregateError) stay safe to log.
     *
     * @returns A serializable object suitable for `JSON.stringify`.
     */
    toJSON(): PaySuiteErrorJSON;
}

export { type ErrorCode as E, PaySuiteError as P, type PaySuiteErrorOptions as a, ErrorCodes as b, type PaySuiteErrorJSON as c };
