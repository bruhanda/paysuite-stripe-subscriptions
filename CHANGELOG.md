# Changelog

All notable changes to `@paysuite/stripe-subscriptions` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-28

Initial public release.

### Added

- **Cross-runtime webhook verification** — `verifyStripeSignature`,
  `verifyStripeSignatureFromText`, and `parseEvent` under
  `@paysuite/stripe-subscriptions/webhooks`. Built on Web Crypto, so the same code
  runs in Node 18+, Bun, Deno, Vercel/Next.js Edge Runtime, and Cloudflare Workers.
  Symmetric tolerance window (rejects both stale and future-dated timestamps),
  multi-`v1=` segment support for secret rotation, DoS guard for empty/oversized
  payloads, and timing-safe HMAC comparison.
- **Composed webhook handler** — `createWebhookHandler` glues verification,
  idempotency, and dispatch into a single `(Request) => Promise<Response>`. Configurable
  `tolerance`, `claimTtl`, `commitTtl`, `inFlightStatus`, plus `onDuplicate` /
  `onInFlight` / `onError` hooks and an optional structured logger.
- **Type-safe event dispatcher** — `createDispatcher()` under
  `@paysuite/stripe-subscriptions/events`. Handlers receive precisely-narrowed Stripe
  event payloads; re-registering the same event is a compile error. Sequential
  execution contract documented for `onAny` ordering. Exports `StripeEventName`,
  `StripeEventOf<N>`, and the type guards `isSubscriptionEvent`, `isInvoiceEvent`,
  `isCheckoutSessionEvent`.
- **Subscription state machine** — `@paysuite/stripe-subscriptions/state-machine`
  ships `SubscriptionStatus` (closed literal union of all eight Stripe statuses),
  `SUBSCRIPTION_STATUSES`, the `VALID_TRANSITIONS` table and
  `validateSubscriptionTransition` validator, the pure `reduceSubscription` event-
  sourced reducer with out-of-order event detection, and a per-instance
  `createTransitionRouter` for `(from, to)` → effect routing.
- **Declarative plan→feature mapping** — `@paysuite/stripe-subscriptions/plans`
  provides `definePlans` with `as const` inference, `resolveFeatures`, the
  asserting `hasFeature` (throws `ConfigError(UNKNOWN_PRICE_ID)`), and the tolerant
  `isFeatureEnabled` (returns `null` for unknown ids). Helper types
  `PlanNameOf<P>`, `PriceIdOf<P>`, `FeatureOf<P>` flow literal information out of
  the config.
- **Pluggable idempotency** — `@paysuite/stripe-subscriptions/idempotency` defines
  the two-phase `IdempotencyStore` interface (`claim` / `commit` / `release` /
  `delete`), the `withIdempotency` higher-order guard, and default TTL constants
  (60 s claim, 7 days commit). Storage adapters under
  `@paysuite/stripe-subscriptions/storage/{memory,redis,postgres,kv,durable-objects}`.
  - `memory` — single-process default; bounded `maxKeys` (default 10 000), expired
    entries swept on every claim.
  - `redis` — atomic `SET NX EX`; `ioredis`-shape compatible.
  - `postgres` — atomic `INSERT … ON CONFLICT DO NOTHING`; expired-claim stealing;
    strict `^[a-zA-Z_][a-zA-Z0-9_]*$` table name validation.
  - `kv` — Cloudflare/Vercel KV, best-effort (documented race window).
  - `durable-objects` — strict atomic claim via a single-threaded DO class
    (reference implementation in JSDoc).
- **Framework adapters** — opt-in subpaths under
  `@paysuite/stripe-subscriptions/adapters/*` for Next.js (App Router and Pages
  Router with `bodyParser: false`), Hono v4+, Fastify, Express (via
  `express.raw({ type: 'application/json' })`), SvelteKit, and Nitro/Nuxt.
- **Structured errors** — `@paysuite/stripe-subscriptions/errors` ships
  `PaySuiteError` plus `SignatureVerificationError`, `InvalidTransitionError`,
  `ConfigError`, `StoreError`, `HandlerError`, the `ErrorCode` literal union, and
  the `ErrorCodes` runtime const. Every error has a stable `code`, optional
  structured `details`, and a JSON-serializable `toJSON()`.
- **Testing utilities** — `@paysuite/stripe-subscriptions/testing` provides
  `buildSubscription`, `buildEvent`, `signPayload` (produces real Stripe-format
  signatures), `createSpyStore` (records every store call), and `createCliBridge`
  (in-memory pub/sub for `stripe listen --print-json` events). The
  `@paysuite/stripe-subscriptions/testing/fixtures` subpath exports `FixtureName`
  and `FixtureOf<N>` types in preparation for the bundled fixture corpus.
- **Subpath exports** — every concern is a separate entry in `package.json`
  `exports`, mirrored in `typesVersions` for editor type resolution; the package
  ships dual ESM + CJS, `"sideEffects": false`, and is built `platform: neutral`
  for runtime portability.

### Documented

- The bounded double-execution window (size = `claimTtl`) and the stolen-claim
  hazard in the 0.1.x idempotency protocol — fencing tokens are tracked for a
  future minor.
- The KV race window and the recommendation to pair with a Durable Object when
  strict atomic claim semantics are required on Cloudflare.
- Why `verifyStripeSignature` requires raw `ArrayBuffer` bytes and why
  `verifyStripeSignatureFromText` is unsafe for non-ASCII payloads.

[0.1.0]: https://github.com/paysuite/stripe-subscriptions/releases/tag/v0.1.0
