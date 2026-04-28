/**
 * Curated root barrel — only the **stable** top-level surface lives here.
 * Most apps should import from a subpath (`/webhooks`, `/events`, ...) so
 * that tree-shaking can keep the bundle minimal.
 */
export { VERSION } from './version.js';
export { PaySuiteError } from './errors/index.js';
export type { ErrorCode } from './errors/index.js';
export type { Result, Ok, Err } from './core/result.js';
