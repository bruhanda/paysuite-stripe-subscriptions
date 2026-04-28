/**
 * Curated root barrel — only the **stable** top-level surface lives here.
 * Per PLAN §2.1, this entry is `VERSION` plus *types only* so the root
 * import stays at the ~0.3 KB budget and tree-shakes cleanly. Importing
 * the error class as a value (for `instanceof` or constructor use) is the
 * `@paysuite/stripe-subscriptions/errors` subpath's job.
 */
export { VERSION } from './version.js';
export type { PaySuiteError, ErrorCode } from './errors/index.js';
export type { Result, Ok, Err } from './core/result.js';
