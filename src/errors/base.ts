import type { ErrorCode } from './codes.js';

/** Constructor options shared by every {@link PaySuiteError} subclass. */
export interface PaySuiteErrorOptions {
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
export interface PaySuiteErrorJSON {
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
export class PaySuiteError extends Error {
  /** Stable programmatic code — see {@link ErrorCode}. */
  readonly code: ErrorCode;
  /** Frozen structured context attached at throw site (when provided). */
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(opts: PaySuiteErrorOptions) {
    super(opts.message);
    this.name = 'PaySuiteError';
    this.code = opts.code;
    if (opts.details !== undefined) {
      this.details = Object.freeze({ ...opts.details });
    }
    if (opts.cause !== undefined) {
      // Error.cause is a standard ES2022 own property — assigning here
      // avoids the ambient `ErrorOptions` parameter under
      // `exactOptionalPropertyTypes`.
      this.cause = opts.cause;
    }
  }

  /**
   * Produce a JSON-serializable snapshot of this error. Recursive `cause`
   * values that are themselves errors are flattened to a `{ name, message }`
   * pair so circular references (e.g. AggregateError) stay safe to log.
   *
   * @returns A serializable object suitable for `JSON.stringify`.
   */
  toJSON(): PaySuiteErrorJSON {
    const base: PaySuiteErrorJSON = {
      name: this.name,
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) base.details = this.details;
    if (this.cause !== undefined) base.cause = serializeCause(this.cause);
    return base;
  }
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof PaySuiteError) return cause.toJSON();
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  return cause;
}
