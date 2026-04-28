/**
 * Injectable clock — lets tests pin `now` deterministically without mocking
 * globals or fighting with `vi.useFakeTimers()`.
 */
export type Clock = () => number;

/**
 * The default clock — returns `Date.now()` (epoch ms). Always passed
 * explicitly through APIs that take a `now` parameter, so swapping it
 * in tests is a one-liner.
 */
export const systemClock: Clock = () => Date.now();
