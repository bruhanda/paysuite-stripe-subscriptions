/**
 * Discriminated-union result type used pervasively for *expected* failure modes
 * (signature mismatch, invalid transition, ...) where forcing callers through
 * try/catch would obscure the control flow.
 *
 * Throwing is reserved for programmer error (missing config, malformed
 * arguments) — those should fail loud at startup rather than be branched on.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Successful branch of a {@link Result}. */
export type Ok<T> = { readonly ok: true; readonly value: T };

/** Failure branch of a {@link Result}. */
export type Err<E> = { readonly ok: false; readonly error: E };

/**
 * Construct a successful {@link Result}.
 *
 * @param value - The success value to wrap.
 * @returns An `Ok` branch carrying `value`.
 *
 * @example
 * ```ts
 * const r = ok(42);
 * if (isOk(r)) console.log(r.value);
 * ```
 */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * Construct a failed {@link Result}.
 *
 * @param error - The failure value to wrap.
 * @returns An `Err` branch carrying `error`.
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * Type guard: narrow a {@link Result} to its `Ok` branch.
 *
 * @param r - The result to inspect.
 * @returns `true` if `r` is `Ok`.
 */
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

/**
 * Type guard: narrow a {@link Result} to its `Err` branch.
 *
 * @param r - The result to inspect.
 * @returns `true` if `r` is `Err`.
 */
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;
