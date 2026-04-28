/**
 * Discriminated-union result type used pervasively for *expected* failure modes
 * (signature mismatch, invalid transition, ...) where forcing callers through
 * try/catch would obscure the control flow.
 *
 * Throwing is reserved for programmer error (missing config, malformed
 * arguments) — those should fail loud at startup rather than be branched on.
 */
type Result<T, E = Error> = Ok<T> | Err<E>;
/** Successful branch of a {@link Result}. */
type Ok<T> = {
    readonly ok: true;
    readonly value: T;
};
/** Failure branch of a {@link Result}. */
type Err<E> = {
    readonly ok: false;
    readonly error: E;
};

export type { Err as E, Ok as O, Result as R };
