// Internal barrel — not exposed via `package.json` exports. Modules outside
// `src/core/` should import the named files directly.
export { hmacSha256, timingSafeEqual } from './crypto.js';
export { encodeUtf8, toHex, fromHex, concatBytes } from './encoding.js';
export { type Clock, systemClock } from './time.js';
export { type Result, type Ok, type Err, ok, err, isOk, isErr } from './result.js';
