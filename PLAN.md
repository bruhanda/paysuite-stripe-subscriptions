# `@paysuite/stripe-subscriptions` — Architecture Plan

> TypeScript-first, Edge-Runtime-ready toolkit for Stripe Billing subscriptions.
> Drop-in helpers for webhook verification, subscription state machines, plan→feature
> mapping, idempotency, and framework adapters. Not a boilerplate, not a SaaS — a library.

---

## 0. Design Principles

| # | Principle | Practical consequence |
|---|---|---|
| 1 | **DX before everything** | Every public API is autocompletion-friendly, errors surface at compile time, JSDoc is exhaustive. |
| 2 | **Cross-runtime by default** | Core uses only Web-standard APIs (`fetch`, `Web Crypto`, `Uint8Array`). Node specifics live in opt-in adapters. |
| 3 | **Tree-shakable, subpath-exported** | Each surface (`/webhooks`, `/state-machine`, `/plans`, `/adapters/*`, `/testing`) is its own entry — apps only pay for what they import. |
| 4 | **Zero runtime dependencies in core** | `stripe` is `peerDependency`, `zod` is optional `peerDependencyMeta`. Storage adapters peer-depend on their backing client. |
| 5 | **Type-driven configuration** | Plan/Price config is a `const` literal; feature unions are inferred — no manual generics, no codegen. |
| 6 | **Errors are structured** | Custom error classes with stable `code` strings, structured `cause`. Throws for programmer error, `Result<T, E>` for expected control flow (signature failure, idempotency hit). |
| 7 | **Stripe is the source of truth** | We don't re-implement billing. We harmonize, type, and de-duplicate. |

---

## 1. Project Structure

```
paysuite-stripe-subscriptions/
├── PLAN.md                           # this document
├── README.md                         # public-facing docs (written after src/)
├── LICENSE                           # MIT
├── CHANGELOG.md                      # changesets-managed
├── package.json                      # see §8
├── tsconfig.json                     # base TS config (strict, NodeNext)
├── tsconfig.build.json               # production build config (no tests)
├── tsup.config.ts                    # bundler config (ESM + CJS + .d.ts)
├── vitest.config.ts                  # unit + integration test config
├── biome.json                        # lint + format (fast, single tool)
├── .changeset/                       # version bump proposals
│   └── config.json
├── .github/
│   └── workflows/
│       ├── ci.yml                    # test, build, lint on PR
│       └── release.yml               # changesets publish on main
│
├── src/
│   ├── index.ts                      # root barrel — re-exports stable surface only
│   │
│   ├── core/                         # zero-dep runtime primitives
│   │   ├── index.ts                  # internal barrel (not exported)
│   │   ├── crypto.ts                 # Web-Crypto HMAC-SHA256 + timing-safe equal
│   │   ├── encoding.ts               # text encoder, hex/base64 helpers
│   │   ├── time.ts                   # monotonic clock abstraction (for testability)
│   │   └── result.ts                 # Result<T, E> discriminated union utilities
│   │
│   ├── webhooks/                     # subpath: "@paysuite/stripe-subscriptions/webhooks"
│   │   ├── index.ts                  # public barrel
│   │   ├── verifier.ts               # verifyStripeSignature() — cross-runtime
│   │   ├── parser.ts                 # parseEvent() — typed Stripe.Event
│   │   ├── handler.ts                # createWebhookHandler() — composed pipeline
│   │   └── headers.ts                # Stripe-Signature header parsing
│   │
│   ├── events/                       # subpath: "@paysuite/stripe-subscriptions/events"
│   │   ├── index.ts                  # public barrel
│   │   ├── dispatcher.ts             # type-safe event router
│   │   ├── types.ts                  # discriminated union of relevant Stripe events
│   │   └── filters.ts                # narrowing helpers (isSubscriptionEvent, etc.)
│   │
│   ├── state-machine/                # subpath: "@paysuite/stripe-subscriptions/state-machine"
│   │   ├── index.ts                  # public barrel
│   │   ├── status.ts                 # SubscriptionStatus type + constants
│   │   ├── transitions.ts            # valid transitions table + transition()
│   │   ├── reducer.ts                # event → state reducer
│   │   └── effects.ts                # transition effects (welcome email, downgrade…)
│   │
│   ├── plans/                        # subpath: "@paysuite/stripe-subscriptions/plans"
│   │   ├── index.ts                  # public barrel
│   │   ├── define.ts                 # definePlans() with const-inference
│   │   ├── resolve.ts                # resolveFeatures(priceId) → readonly features
│   │   └── types.ts                  # PlanConfig, FeatureMap, PriceId<P> generics
│   │
│   ├── idempotency/                  # subpath: "@paysuite/stripe-subscriptions/idempotency"
│   │   ├── index.ts                  # public barrel
│   │   ├── store.ts                  # IdempotencyStore interface + InMemory default
│   │   ├── guard.ts                  # withIdempotency() higher-order wrapper
│   │   └── ttl.ts                    # default 7-day TTL constant
│   │
│   ├── errors/                       # subpath: "@paysuite/stripe-subscriptions/errors"
│   │   ├── index.ts                  # all error classes + ErrorCode
│   │   ├── codes.ts                  # const enum of stable error codes
│   │   └── base.ts                   # PaySuiteError base class
│   │
│   ├── adapters/                     # framework integrations (each opt-in)
│   │   ├── next/                     # subpath: ".../adapters/next"
│   │   │   ├── index.ts
│   │   │   ├── app-router.ts         # Route Handler factory
│   │   │   └── pages-router.ts       # NextApiHandler factory
│   │   ├── hono/                     # subpath: ".../adapters/hono"
│   │   │   └── index.ts
│   │   ├── fastify/                  # subpath: ".../adapters/fastify"
│   │   │   └── index.ts
│   │   ├── express/                  # subpath: ".../adapters/express"
│   │   │   └── index.ts
│   │   ├── sveltekit/                # subpath: ".../adapters/sveltekit"
│   │   │   └── index.ts
│   │   └── nitro/                    # subpath: ".../adapters/nitro"
│   │       └── index.ts
│   │
│   ├── storage/                      # idempotency + state stores (each opt-in)
│   │   ├── memory/                   # subpath: ".../storage/memory"
│   │   │   └── index.ts              # default in-memory store
│   │   ├── redis/                    # subpath: ".../storage/redis"
│   │   │   └── index.ts              # ioredis / @upstash/redis adapter
│   │   ├── kv/                       # subpath: ".../storage/kv"
│   │   │   └── index.ts              # Cloudflare KV / Vercel KV adapter
│   │   └── postgres/                 # subpath: ".../storage/postgres"
│   │       └── index.ts              # pg / postgres / drizzle adapter
│   │
│   └── testing/                      # subpath: "@paysuite/stripe-subscriptions/testing"
│       ├── index.ts                  # public barrel — only imported in tests
│       ├── factories.ts              # buildSubscription(), buildEvent()
│       ├── signing.ts                # sign() — produce valid signature for tests
│       ├── mock-store.ts             # spy-able IdempotencyStore
│       └── cli-bridge.ts             # Stripe CLI → fixture capture helper
│
├── tests/                            # tests live next to source as *.test.ts
│   ├── e2e/                          # against `stripe listen` (opt-in CI)
│   │   └── webhooks.e2e.ts
│   └── fixtures/                     # captured webhook payloads + signatures
│       ├── checkout.session.completed.json
│       ├── customer.subscription.updated.json
│       └── invoice.payment_failed.json
│
└── examples/                         # runnable, copy-pastable demos
    ├── nextjs-app-router/
    ├── hono-edge/
    ├── cloudflare-workers/
    └── express-node/
```

### 1.1 File-by-file responsibility

| File | Purpose |
|---|---|
| `src/index.ts` | Curated barrel: only **stable** top-level surface (PaySuite, version, types). Subpath imports are the recommended path. |
| `src/core/crypto.ts` | `hmacSha256(key, data)` and `timingSafeEqual(a, b)` over Web Crypto, isomorphic. |
| `src/core/encoding.ts` | `encodeUtf8`, `toHex`, `fromHex`, `concatBytes`. Avoids `Buffer`. |
| `src/core/time.ts` | `now()` injectable clock — lets tests pin time without mocking globals. |
| `src/core/result.ts` | `Ok<T>` / `Err<E>` types + `ok()`, `err()`, `isOk()`, `isErr()`, `unwrap()` helpers. |
| `src/webhooks/verifier.ts` | `verifyStripeSignature({ payload, header, secret, tolerance })` — pure function returning `Result`. |
| `src/webhooks/parser.ts` | `parseEvent(rawPayload)` → typed `Stripe.Event` via `JSON.parse` + structural validation. |
| `src/webhooks/handler.ts` | `createWebhookHandler(opts)` — composes verifier + idempotency + dispatcher into a single Web `Request`→`Response` function. |
| `src/webhooks/headers.ts` | Parses `Stripe-Signature` header into `{ t, v1[] }` shape. |
| `src/events/dispatcher.ts` | `createDispatcher().on('customer.subscription.updated', handler)` — type-narrowed payloads. |
| `src/events/types.ts` | Re-exports + narrows `Stripe.Event` discriminated union to subscription/invoice subset we care about. |
| `src/events/filters.ts` | `isSubscriptionEvent(event)`, `isInvoiceEvent(event)` — type guards. |
| `src/state-machine/status.ts` | `SubscriptionStatus` literal union mirroring Stripe's 7 statuses. |
| `src/state-machine/transitions.ts` | Static table of valid transitions + `transition(from, to)` returning `Result`. |
| `src/state-machine/reducer.ts` | `reduce(state, event)` — pure event-sourced reducer. |
| `src/state-machine/effects.ts` | Type-safe registration of side effects per transition (e.g. only `trialing→active` triggers welcome). |
| `src/plans/define.ts` | `definePlans({ pro: { priceId: 'price_…', features: [...] } } as const)` with `const` inference. |
| `src/plans/resolve.ts` | `resolveFeatures(plans, priceId)` returns the typed feature array. |
| `src/plans/types.ts` | The generics that make `priceId` autocompletion + feature inference work. |
| `src/idempotency/store.ts` | `IdempotencyStore` interface (`has`, `set`, `delete`) + `InMemoryStore` reference impl. |
| `src/idempotency/guard.ts` | `withIdempotency(store, key, fn)` — checks → executes → records. |
| `src/errors/base.ts` | `PaySuiteError extends Error` with `code`, `cause`, `details`. |
| `src/errors/codes.ts` | Exhaustive `ErrorCode` literal union — programmatic dispatch on errors. |
| `src/adapters/next/app-router.ts` | `createNextRouteHandler(opts)` returning `{ POST }` shaped for App Router. |
| `src/adapters/hono/index.ts` | `createHonoMiddleware(opts)` typed for Hono v4. |
| `src/storage/redis/index.ts` | `createRedisStore(client)` accepting both `ioredis` and `@upstash/redis`. |
| `src/storage/kv/index.ts` | `createKvStore(kv)` for Cloudflare/Vercel KV (Web-standard interface). |
| `src/testing/signing.ts` | `signPayload(secret, payload, timestamp?)` — produces a valid `Stripe-Signature` header for tests. |

---

## 2. Public API Design

The library has **one entry per concern**. Below: every exported symbol with full
TypeScript signature, JSDoc, and an idiomatic usage example.

### 2.1 Root entry — `@paysuite/stripe-subscriptions`

Curated exports only. Most apps will import from subpaths.

```ts
export { VERSION } from './version.js';
export type { PaySuiteError } from './errors/index.js';
export type { Result, Ok, Err } from './core/result.js';
```

### 2.2 Webhook verification — `/webhooks`

```ts
/**
 * Result of a webhook signature verification.
 * Use the discriminated union to handle success/failure exhaustively.
 */
export type VerifyResult =
  | { ok: true;  event: Stripe.Event; receivedAt: number }
  | { ok: false; error: SignatureVerificationError };

/**
 * Options for {@link verifyStripeSignature}.
 */
export interface VerifyOptions {
  /** Raw request body — MUST be the exact bytes Stripe signed. Pass `Uint8Array`, `string`, or `ArrayBuffer`. */
  payload: Uint8Array | ArrayBuffer | string;
  /** Value of the `Stripe-Signature` HTTP header. */
  header: string;
  /** Webhook signing secret from the Stripe Dashboard (`whsec_…`). */
  secret: string;
  /** Max accepted age of the signature in seconds. Defaults to 300 (5 min). Set lower for strict replay protection. */
  tolerance?: number;
  /** Override the clock — useful in tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Verifies a Stripe webhook signature using HMAC-SHA256 over the canonical
 * `${timestamp}.${payload}` string and the `whsec_…` secret.
 *
 * Runs identically in Node 18+, Bun, Deno, Edge Runtime, and Cloudflare Workers
 * — implemented entirely on Web Crypto (`crypto.subtle`).
 *
 * Does not throw on invalid signatures; returns a `Result` so callers can
 * branch deterministically. Throws only on programmer error (missing secret,
 * malformed options).
 *
 * @example
 * ```ts
 * const result = await verifyStripeSignature({
 *   payload: await req.arrayBuffer(),
 *   header: req.headers.get('stripe-signature')!,
 *   secret: process.env.STRIPE_WEBHOOK_SECRET!,
 * });
 *
 * if (!result.ok) {
 *   return new Response(result.error.message, { status: 400 });
 * }
 * console.log('Verified event:', result.event.type);
 * ```
 */
export function verifyStripeSignature(opts: VerifyOptions): Promise<VerifyResult>;

/**
 * Creates a fully-composed webhook handler that:
 *   1. Reads raw body from `Request`
 *   2. Verifies the Stripe signature
 *   3. De-duplicates by `event.id` via the configured store
 *   4. Dispatches to your registered handlers
 *   5. Returns a `Response` with the appropriate status code
 *
 * Designed to be the single line of glue inside any framework's route handler.
 *
 * @example
 * ```ts
 * import { createWebhookHandler } from '@paysuite/stripe-subscriptions/webhooks';
 * import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
 *
 * const dispatcher = createDispatcher()
 *   .on('customer.subscription.created', async ({ data }) => { ... })
 *   .on('customer.subscription.updated', async ({ data }) => { ... });
 *
 * export const handler = createWebhookHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   dispatcher,
 *   store: createRedisStore(redis),
 * });
 * ```
 */
export function createWebhookHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>
): (request: Request) => Promise<Response>;

export interface WebhookHandlerOptions<E extends StripeEventName = StripeEventName> {
  secret: string;
  dispatcher: EventDispatcher<E>;
  /** Store used to record processed `event.id`s. Defaults to an in-memory store (NOT recommended in production). */
  store?: IdempotencyStore;
  /** TTL (seconds) to retain processed event ids. Defaults to 604_800 (7 days, matching Stripe retry window). */
  idempotencyTtl?: number;
  tolerance?: number;
  /** Hook called when an event is skipped because it was already processed. */
  onDuplicate?: (eventId: string) => void;
  /** Hook called for unexpected errors inside dispatched handlers. The library still returns 5xx so Stripe retries. */
  onError?: (error: unknown, event: Stripe.Event) => void;
}
```

### 2.3 Event dispatcher — `/events`

```ts
/**
 * Subset of Stripe event names this library treats as first-class.
 * (Other events still flow through `dispatcher.onAny`.)
 */
export type StripeEventName =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.payment_succeeded'
  | 'invoice.upcoming'
  | 'checkout.session.completed'
  | 'checkout.session.expired';

/** Maps an event name to its narrowed Stripe.Event subtype. */
export type StripeEventOf<N extends StripeEventName> =
  Extract<Stripe.Event, { type: N }>;

/**
 * Builds a type-safe event router. Handlers receive the precisely-narrowed
 * Stripe event payload — no manual casting.
 *
 * @example
 * ```ts
 * const dispatcher = createDispatcher()
 *   .on('customer.subscription.updated', async (event) => {
 *     // event.data.object is typed as Stripe.Subscription, not Stripe.Event['data']['object']
 *     console.log(event.data.object.status);
 *   })
 *   .onAny((event) => log('saw', event.type));
 * ```
 */
export function createDispatcher(): EventDispatcher<never>;

export interface EventDispatcher<Registered extends StripeEventName = never> {
  /**
   * Register a handler for a specific event type. Returns a new dispatcher
   * with `Name` added to the registered set (immutable, builder-style).
   */
  on<Name extends StripeEventName>(
    name: Name,
    handler: (event: StripeEventOf<Name>) => Promise<void> | void
  ): EventDispatcher<Registered | Name>;

  /** Register a fallback handler invoked for every event after the typed handler runs. */
  onAny(handler: (event: Stripe.Event) => Promise<void> | void): EventDispatcher<Registered>;

  /** Internal: invoked by `createWebhookHandler`. */
  dispatch(event: Stripe.Event): Promise<void>;

  /** Compile-time set of registered event names — exposed for exhaustiveness checks. */
  readonly registered: ReadonlySet<Registered>;
}
```

### 2.4 Subscription state machine — `/state-machine`

```ts
/** All Stripe subscription statuses, mirrored verbatim. */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/**
 * Static table of allowed transitions. Built from Stripe's documented behavior.
 * Used by `transition()` and the `reducer`.
 */
export const VALID_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>>
>;

/**
 * Validate a status transition. Returns Ok if valid, Err with `INVALID_TRANSITION`
 * otherwise. Pure — no side effects.
 *
 * @example
 * ```ts
 * const r = transition('trialing', 'active');
 * if (r.ok) commit(r.value);
 * ```
 */
export function transition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): Result<{ from: SubscriptionStatus; to: SubscriptionStatus }, InvalidTransitionError>;

/**
 * Reducer that derives a new subscription state from the previous state and a
 * Stripe event. Designed to be used inside your application's persistence
 * layer (Postgres write, Redis cache, etc.).
 */
export function reduce(
  prev: SubscriptionState | null,
  event: StripeEventOf<'customer.subscription.created'
                     | 'customer.subscription.updated'
                     | 'customer.subscription.deleted'>
): SubscriptionState;

export interface SubscriptionState {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  priceId: string;
  currentPeriodStart: number;  // unix seconds
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  trialEnd: number | null;
  updatedAt: number;
}

/**
 * Register an effect to run when a transition occurs. Effects are typed by
 * the *exact* transition pair, so `trialing→active` cannot accidentally fire
 * for a `past_due→active` recovery.
 */
export function onTransition<From extends SubscriptionStatus, To extends SubscriptionStatus>(
  from: From,
  to: To,
  effect: (ctx: TransitionContext<From, To>) => Promise<void> | void
): void;
```

### 2.5 Plan-to-feature mapping — `/plans`

```ts
/**
 * Defines the set of plans your application offers. Pass an object with `as const`
 * to unlock literal-type inference: feature unions, price-id autocompletion,
 * and exhaustive plan-name checks all flow from this single declaration.
 *
 * @example
 * ```ts
 * const plans = definePlans({
 *   free: {
 *     priceId: 'price_free',
 *     features: ['basic_export', 'community_support'],
 *   },
 *   pro: {
 *     priceId: 'price_1OabcXYZ',
 *     features: ['basic_export', 'priority_support', 'custom_domain', 'ai_credits_500'],
 *   },
 *   team: {
 *     priceId: 'price_1OdefGHI',
 *     features: ['basic_export', 'priority_support', 'custom_domain', 'ai_credits_5000', 'sso'],
 *   },
 * } as const);
 *
 * type Feature = FeatureOf<typeof plans>;
 * //   ^? 'basic_export' | 'community_support' | 'priority_support' | 'custom_domain' | 'ai_credits_500' | 'ai_credits_5000' | 'sso'
 *
 * const features = resolveFeatures(plans, 'price_1OabcXYZ');
 * //    ^? readonly ['basic_export', 'priority_support', 'custom_domain', 'ai_credits_500']
 * ```
 */
export function definePlans<P extends PlanConfigInput>(plans: P): PlansConfig<P>;

export type PlanConfigInput = {
  readonly [planName: string]: {
    readonly priceId: string;
    readonly features: readonly string[];
  };
};

export type PlansConfig<P extends PlanConfigInput> = P & {
  readonly __brand: 'PlansConfig';
};

/** Union of all plan names declared in `definePlans`. */
export type PlanNameOf<P> = P extends PlansConfig<infer I> ? Extract<keyof I, string> : never;

/** Union of all `priceId` literals declared in `definePlans`. */
export type PriceIdOf<P> =
  P extends PlansConfig<infer I> ? I[keyof I]['priceId'] : never;

/** Union of all feature literals appearing in any plan. */
export type FeatureOf<P> =
  P extends PlansConfig<infer I> ? I[keyof I]['features'][number] : never;

/**
 * Resolve a price-id to its (typed, immutable) feature list. Returns `null`
 * when the price-id is not declared — narrow before use.
 */
export function resolveFeatures<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: PriceIdOf<P> | (string & {})
): ReadonlyArray<FeatureOf<P>> | null;

/**
 * Type-guard that an arbitrary string is a known feature for the given plans.
 */
export function hasFeature<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: string,
  feature: FeatureOf<P>
): boolean;
```

### 2.6 Idempotency — `/idempotency`

```ts
/**
 * Pluggable storage interface for de-duplicating webhook events.
 * Implementations exist for Redis, KV, Postgres, and in-memory (default).
 *
 * Implementations MUST be safe under concurrent calls — `set` should be atomic
 * with TTL semantics (e.g. Redis `SET NX EX`).
 */
export interface IdempotencyStore {
  /** Returns `true` if a value with `key` is already present (and unexpired). */
  has(key: string): Promise<boolean>;
  /**
   * Atomically inserts `key` only if absent. Returns `true` on insert, `false` if
   * `key` was already present (the contract that drives "exactly once" handling).
   */
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>;
  /** Best-effort delete — used for compensation flows in tests. */
  delete(key: string): Promise<void>;
}

/**
 * Wrap a function so it runs at most once per `key` within `ttlSeconds`.
 *
 * Behavior:
 *  - First call: `setIfAbsent` returns true, `fn` runs, return `Ok(value)`.
 *  - Subsequent call within TTL: returns `Ok(undefined)` and `fn` does NOT run.
 *  - `fn` throws: the key is still recorded (we trust your handler is internally
 *    idempotent OR raises a structured retry error). Use `withRetry` for retryable.
 *
 * @example
 * ```ts
 * await withIdempotency(store, `stripe:event:${event.id}`, async () => {
 *   await db.processSubscription(event);
 * });
 * ```
 */
export function withIdempotency<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  opts?: { ttlSeconds?: number }
): Promise<{ ran: true; value: T } | { ran: false }>;

/** Default in-memory store. NOT for production — replace with `redis`/`kv`/`postgres`. */
export class InMemoryIdempotencyStore implements IdempotencyStore { /* … */ }
```

### 2.7 Errors — `/errors`

```ts
/**
 * Stable, programmatic error codes. Backwards-compatible across minor versions.
 */
export const ErrorCode = {
  INVALID_SIGNATURE_FORMAT:    'INVALID_SIGNATURE_FORMAT',
  SIGNATURE_TIMESTAMP_TOO_OLD: 'SIGNATURE_TIMESTAMP_TOO_OLD',
  SIGNATURE_MISMATCH:          'SIGNATURE_MISMATCH',
  MISSING_SECRET:              'MISSING_SECRET',
  MALFORMED_PAYLOAD:           'MALFORMED_PAYLOAD',
  INVALID_TRANSITION:          'INVALID_TRANSITION',
  UNKNOWN_PRICE_ID:            'UNKNOWN_PRICE_ID',
  STORE_UNAVAILABLE:           'STORE_UNAVAILABLE',
  HANDLER_FAILED:              'HANDLER_FAILED',
  CONFIG_INVALID:              'CONFIG_INVALID',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base class for every error this library emits. Always includes a stable `code`. */
export class PaySuiteError extends Error {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;
  constructor(opts: { code: ErrorCode; message: string; details?: Record<string, unknown>; cause?: unknown });
}

export class SignatureVerificationError extends PaySuiteError { /* code ∈ INVALID_SIGNATURE_FORMAT | SIGNATURE_TIMESTAMP_TOO_OLD | SIGNATURE_MISMATCH */ }
export class InvalidTransitionError    extends PaySuiteError { /* code = INVALID_TRANSITION */ }
export class ConfigError               extends PaySuiteError { /* code = CONFIG_INVALID */ }
export class StoreError                extends PaySuiteError { /* code = STORE_UNAVAILABLE */ }
```

### 2.8 Adapters — `/adapters/*`

```ts
// /adapters/next
/**
 * App Router route handler factory. Returns an object you spread into your route file.
 *
 * @example
 * ```ts
 * // app/api/stripe/webhooks/route.ts
 * import { createNextRouteHandler } from '@paysuite/stripe-subscriptions/adapters/next';
 *
 * export const runtime = 'edge';
 * export const { POST } = createNextRouteHandler({ secret: process.env.STRIPE_WEBHOOK_SECRET!, dispatcher });
 * ```
 */
export function createNextRouteHandler(opts: WebhookHandlerOptions): { POST: (req: Request) => Promise<Response> };

/** Pages Router (legacy) — wires `bodyParser: false` config shape. */
export function createNextApiHandler(opts: WebhookHandlerOptions): NextApiHandler;
export const config: { api: { bodyParser: false } };

// /adapters/hono
export function createHonoMiddleware(opts: WebhookHandlerOptions): MiddlewareHandler;

// /adapters/fastify
export function createFastifyPlugin(opts: WebhookHandlerOptions): FastifyPluginCallback;

// /adapters/express
export function createExpressMiddleware(opts: WebhookHandlerOptions): RequestHandler;
```

### 2.9 Storage adapters — `/storage/*`

```ts
// /storage/redis  (peer: ioredis OR @upstash/redis)
export function createRedisStore(client: RedisLike): IdempotencyStore;

// /storage/kv  (Cloudflare/Vercel KV — Web-standard interface)
export function createKvStore(kv: KVNamespace): IdempotencyStore;

// /storage/postgres  (peer: any client implementing the SqlExecutor interface)
export function createPostgresStore(executor: SqlExecutor, opts?: { table?: string }): IdempotencyStore;

// /storage/memory
export function createMemoryStore(): IdempotencyStore;
```

### 2.10 Testing utilities — `/testing`

```ts
/** Build a syntactically-valid Stripe.Subscription for tests. All fields can be overridden. */
export function buildSubscription(overrides?: Partial<Stripe.Subscription>): Stripe.Subscription;

/** Build a syntactically-valid Stripe.Event with a given type and embedded object. */
export function buildEvent<N extends StripeEventName>(
  type: N,
  object: StripeEventOf<N>['data']['object'],
  overrides?: Partial<Stripe.Event>
): StripeEventOf<N>;

/**
 * Produce a valid `Stripe-Signature` header for an arbitrary payload — useful
 * for unit-testing your webhook handler without spinning up `stripe listen`.
 */
export async function signPayload(opts: {
  secret: string;
  payload: string | Uint8Array;
  timestamp?: number;
}): Promise<string>;

/** Pre-fabricated event fixtures captured from real Stripe test mode. */
export const fixtures: {
  checkoutSessionCompleted: Stripe.Checkout.Session;
  subscriptionCreated: Stripe.Subscription;
  subscriptionUpdated: Stripe.Subscription;
  invoicePaymentFailed: Stripe.Invoice;
};

/** A spy-able IdempotencyStore — used in tests to assert duplicate handling. */
export function createSpyStore(): IdempotencyStore & {
  readonly calls: ReadonlyArray<{ method: 'has' | 'setIfAbsent' | 'delete'; key: string }>;
  reset(): void;
};
```

---

## 3. Internal Architecture

### 3.1 Module dependency graph

```
                                    ┌──────────────────────────────┐
                                    │ src/index.ts (root barrel)   │
                                    └──────────────┬───────────────┘
                                                   │
        ┌──────────────────────────────┬──────────┼──────────────┬───────────────────────────┐
        ▼                              ▼          ▼              ▼                           ▼
   /webhooks                       /events  /state-machine    /plans                    /idempotency
        │                              │           │              │                           │
        │ uses: verifier ▶ parser      │           │              │                           │
        │ uses: handler  ▶ dispatcher  │           │              │                           │
        │       (events)   (events)    │           │              │                           │
        └──────────────┬───────────────┘           │              │                           │
                       │                           │              │                           │
                       ▼                           │              │                           │
                  /core (zero-dep)  ◀──────────────┴──────────────┴───────────────────────────┘
                  • crypto.ts (Web Crypto only)
                  • encoding.ts
                  • result.ts
                  • time.ts
                       ▲
                       │ (no upward deps)
                       │
                  /errors  ◀───── consumed by every module above

   /adapters/*  →  /webhooks  (only)
   /storage/*   →  /idempotency  (only — implements IdempotencyStore)
   /testing     →  /webhooks + /events + /idempotency  (test-only)
```

### 3.2 Data flow — request → response

```
HTTP Request (raw body, headers)
        │
        ▼
┌────────────────────┐
│ adapter.next/hono/ │  Reads raw body as Uint8Array (framework-specific bit)
│ fastify/express    │
└────────┬───────────┘
         ▼
┌────────────────────┐
│ verifyStripe-      │  Web-Crypto HMAC-SHA256, timing-safe compare, tolerance check
│ Signature()        │
└────────┬───────────┘
         │ Result.ok? ──no──▶ 400 Bad Request
         ▼
┌────────────────────┐
│ parseEvent()       │  JSON.parse, narrow to typed Stripe.Event
└────────┬───────────┘
         ▼
┌────────────────────┐
│ withIdempotency(   │  store.setIfAbsent(`stripe:event:${event.id}`, ttl)
│   store, event.id  │  ─ already set? skip dispatcher, return 200 (Stripe stops retrying)
│ )                  │
└────────┬───────────┘
         ▼
┌────────────────────┐
│ dispatcher.dispatch│  Routes to typed handler(s); falls through to onAny
│ (event)            │
└────────┬───────────┘
         │  handler throws? ──▶ 500 (Stripe retries) + onError hook
         ▼
       200 OK
```

### 3.3 Key design patterns

| Pattern | Where | Why |
|---|---|---|
| **Builder with phantom types** | `EventDispatcher<Registered>` | Each `.on(name, …)` returns a dispatcher with `Registered \| Name` — enables compile-time exhaustiveness against a target list. |
| **Pure functions + injected clock** | `verifier`, `time.ts` | Deterministic tests without `jest.useFakeTimers`. |
| **Const-inference brand types** | `definePlans` → `PlansConfig<P>` | Carries the literal type through the rest of the API, so `resolveFeatures` returns precisely-typed feature tuples. |
| **Result\<T, E> for expected failures** | webhook verification, transition validation | Forces callers to handle the error path; never throws on wrong-but-expected input. |
| **Throw for programmer error** | missing secret, malformed config | Loud failure during boot is correct — these are bugs, not control flow. |
| **Immutable transition table** | `state-machine/transitions.ts` | `Object.freeze`'d, `as const` — single source of truth for valid transitions, fully type-readable. |
| **Strategy via interface** | `IdempotencyStore` | Same handler code works on Redis, KV, Postgres, in-memory; chosen by the host app at composition time. |
| **Higher-order composition** | `createWebhookHandler` | The whole pipeline (verify → idempotency → dispatch) is a single composable function — not OO inheritance. |

---

## 4. Type System

### 4.1 Core building blocks

```ts
// Result type — pervasive, replaces try/catch for expected failure modes
export type Result<T, E = Error> = Ok<T> | Err<E>;
export type Ok<T>  = { readonly ok: true;  readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };

export const ok  = <T>(value: T): Ok<T> => ({ ok: true,  value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk  = <T, E>(r: Result<T, E>): r is Ok<T>  => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;
```

### 4.2 Stripe event narrowing

We rely on `Stripe.Event` from `stripe` v15+ which is already a discriminated union
on `type`. We **do not** redeclare it; we narrow:

```ts
// Generic that picks one branch of the union
type StripeEventOf<N extends Stripe.Event['type']> = Extract<Stripe.Event, { type: N }>;

// Library-curated subset of "interesting" event names
type StripeEventName =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  // … (see §2.3)
```

When `dispatcher.on('customer.subscription.updated', handler)` is called,
`handler`'s parameter is narrowed to `Extract<Stripe.Event, { type: 'customer.subscription.updated' }>`,
whose `data.object` is `Stripe.Subscription` — fully typed without casts.

### 4.3 Plan inference (the centerpiece)

The `definePlans` API uses a `PlanConfigInput` constraint that requires
`readonly` arrays so TypeScript preserves literal types:

```ts
type PlanConfigInput = {
  readonly [planName: string]: {
    readonly priceId: string;
    readonly features: readonly string[];
  };
};

declare function definePlans<P extends PlanConfigInput>(plans: P): PlansConfig<P>;

type PlansConfig<P extends PlanConfigInput> = P & { readonly __brand: 'PlansConfig' };

type PriceIdOf<P> = P extends PlansConfig<infer I> ? I[keyof I]['priceId'] : never;
type FeatureOf<P> = P extends PlansConfig<infer I> ? I[keyof I]['features'][number] : never;

// Caller writes:
const plans = definePlans({
  pro: { priceId: 'price_1OabcXYZ', features: ['custom_domain', 'ai_credits_500'] }
} as const);

// And gets:
type P = PriceIdOf<typeof plans>;   // 'price_1OabcXYZ'
type F = FeatureOf<typeof plans>;   // 'custom_domain' | 'ai_credits_500'
```

The brand `__brand: 'PlansConfig'` prevents accidental passing of a raw object
literal to `resolveFeatures` — caller must go through `definePlans()`.

### 4.4 Compile-time exhaustiveness

`EventDispatcher<Registered>` carries the set of registered events in the type
so consumers can write:

```ts
type RequiredEvents =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted';

function assertExhaustive<R extends RequiredEvents>(d: EventDispatcher<R>): EventDispatcher<R> { return d; }

const d = assertExhaustive(
  createDispatcher()
    .on('customer.subscription.created', …)
    .on('customer.subscription.updated', …)
    // forgot 'deleted' → compile error
);
```

### 4.5 Strict mode posture

`tsconfig.json` enables: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
This rules out a long list of latent bugs — particularly the
`config[key]` returns `T | undefined` semantics that catch missed plan lookups.

---

## 5. Error Handling Strategy

### 5.1 Throw vs. Return matrix

| Scenario | Strategy | Rationale |
|---|---|---|
| Missing webhook secret in config | **Throw** `ConfigError` | Programmer error — fail loud at startup. |
| Malformed `Stripe-Signature` header | **Return** `Err(SignatureVerificationError)` | Expected attacker behavior — caller answers `400`. |
| Timestamp older than tolerance | **Return** `Err(SignatureVerificationError)` (code: `SIGNATURE_TIMESTAMP_TOO_OLD`) | Same. |
| Signature mismatch | **Return** `Err(SignatureVerificationError)` (code: `SIGNATURE_MISMATCH`) | Same. |
| Invalid state transition called explicitly | **Return** `Err(InvalidTransitionError)` | Allows callers to log + skip without try/catch. |
| Storage adapter network failure | **Throw** `StoreError` | Infra failure should bubble to caller / 5xx so Stripe retries. |
| User handler throws | **Re-throw** wrapped in `HandlerError` (`code: HANDLER_FAILED`) after `onError` callback, return 5xx | Stripe retry policy depends on this. |
| Unknown event in dispatcher (no handler registered) | **Silently ignore** (warning via optional `logger`) | Stripe sends many event types; ignoring unrelated ones is correct. |
| Unknown `priceId` in `resolveFeatures` | **Return** `null` | Discoverable via type narrowing; not exceptional. |

### 5.2 Error class hierarchy

```
Error
└── PaySuiteError                  (always carries `code: ErrorCode`)
    ├── SignatureVerificationError
    ├── InvalidTransitionError
    ├── ConfigError
    ├── StoreError
    └── HandlerError                (wraps user-thrown errors, preserves `cause`)
```

Every error is JSON-serializable: `{ name, code, message, details, cause }`.
This is the key property that lets observability stacks (Sentry, Axiom)
produce useful breadcrumbs without manual mapping.

### 5.3 Logging surface

The library does **not** ship a logger. It accepts an optional
`logger?: { warn(msg, ctx); error(msg, ctx) }` on `createWebhookHandler` and
storage adapters. No `console.log`, no `debug` package, no global state.

---

## 6. Bundle & Tree-shaking Plan

### 6.1 Entry points

| Subpath | Purpose | Approx. size (min+gzip) |
|---|---|---|
| `.` (root) | Curated barrel — `VERSION`, types only | ~0.3 KB |
| `./webhooks` | Verification + composed handler | ~3 KB |
| `./events` | Type-safe dispatcher | ~1 KB |
| `./state-machine` | Transitions, reducer, effects | ~1.5 KB |
| `./plans` | `definePlans`, `resolveFeatures` | ~0.5 KB |
| `./idempotency` | Guard + in-memory store | ~0.6 KB |
| `./errors` | Error classes + codes | ~0.4 KB |
| `./adapters/next` | Next App + Pages Router glue | ~0.4 KB |
| `./adapters/hono` | Hono middleware glue | ~0.3 KB |
| `./adapters/fastify` | Fastify plugin glue | ~0.3 KB |
| `./adapters/express` | Express middleware glue | ~0.3 KB |
| `./storage/memory` | In-memory store | ~0.2 KB |
| `./storage/redis` | Redis store (peers ioredis/@upstash/redis) | ~0.3 KB |
| `./storage/kv` | Cloudflare/Vercel KV store | ~0.2 KB |
| `./storage/postgres` | Postgres store | ~0.4 KB |
| `./testing` | Factories + signing helpers | ~1.5 KB |

**Total full library:** ~10 KB min+gzip — within target of 8–15 KB.
**Typical "Edge Runtime user" (root + webhooks + events + idempotency):** ~5 KB.

### 6.2 Tree-shaking rules

- `package.json` ships `"sideEffects": false`.
- Every subpath has its own ESM and CJS build (tsup dual emit).
- No top-level `console.*` calls anywhere.
- No top-level mutable singletons (state machines, plan caches are constructed on call).
- Core re-exports use `export { foo } from './foo.js'` — never `export *`.

### 6.3 Build pipeline (tsup)

```ts
// tsup.config.ts (concept — not implemented yet)
{
  entry: {
    'index': 'src/index.ts',
    'webhooks/index': 'src/webhooks/index.ts',
    'events/index': 'src/events/index.ts',
    'state-machine/index': 'src/state-machine/index.ts',
    'plans/index': 'src/plans/index.ts',
    'idempotency/index': 'src/idempotency/index.ts',
    'errors/index': 'src/errors/index.ts',
    'adapters/next/index': 'src/adapters/next/index.ts',
    'adapters/hono/index': 'src/adapters/hono/index.ts',
    'adapters/fastify/index': 'src/adapters/fastify/index.ts',
    'adapters/express/index': 'src/adapters/express/index.ts',
    'storage/memory/index': 'src/storage/memory/index.ts',
    'storage/redis/index': 'src/storage/redis/index.ts',
    'storage/kv/index': 'src/storage/kv/index.ts',
    'storage/postgres/index': 'src/storage/postgres/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  treeshake: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',     // important: keeps output runtime-agnostic
}
```

---

## 7. Dependencies

### 7.1 Runtime dependencies

**None.** Core uses only Web-standard APIs (`crypto.subtle`, `TextEncoder`).

### 7.2 Peer dependencies

| Package | Range | Why peer | What if missing |
|---|---|---|---|
| `stripe` | `>=15.0.0` | Stripe ships `Stripe.Event` discriminated union types we narrow. Don't bundle — let host control version. | Type errors at install. |
| `zod` | `>=3.22 \| >=4` | Runtime-validating user-provided plans config in `definePlans` (when `validate: true`). Optional. | Marked in `peerDependenciesMeta.optional` — works without zod, validation no-op. |

Adapter-specific peers (declared as `peerDependenciesMeta.optional` to avoid forcing installation when unused):

| Adapter subpath | Peer | Range |
|---|---|---|
| `/adapters/next` | `next` | `>=13.4` |
| `/adapters/hono` | `hono` | `>=4` |
| `/adapters/fastify` | `fastify` | `>=4` |
| `/adapters/express` | `express` | `>=4` |
| `/storage/redis` | `ioredis` *or* `@upstash/redis` | any |
| `/storage/kv` | none — uses Web-standard `KVNamespace` interface | — |
| `/storage/postgres` | none — accepts a thin `SqlExecutor` callback | — |

### 7.3 Dev dependencies

| Package | Purpose |
|---|---|
| `typescript` | ^5.4 |
| `tsup` | bundler (esbuild + dts) |
| `vitest` | test runner — Edge-Runtime aware |
| `@vitest/coverage-v8` | coverage |
| `@biomejs/biome` | lint + format (one tool, fast) |
| `@changesets/cli` | versioning + changelog |
| `@types/node` | dev only — never imported in `src/` |
| `stripe` | dev — for type checking |
| `zod` | dev — for type checking |

### 7.4 Justification: why zero runtime deps

- Edge Runtime + Cloudflare Workers have hard size limits (1 MB compressed for free tier).
- Every transitive dep is a supply-chain risk.
- The library's *value* is curation + types. We don't gain leverage from a util lib.

---

## 8. Configuration

### 8.1 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],          // DOM for Web Crypto types
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "tests/**"]
}
```

### 8.2 `vitest.config.ts` (sketch)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/testing/**'],
    },
  },
});
```

A second project entry runs the verifier suite under
`@edge-runtime/vm` to assert true cross-runtime parity.

### 8.3 `package.json` fields (full version in repo root)

Ships with:
- `"type": "module"` (ESM-first)
- `"sideEffects": false` (tree-shaking)
- `"exports"` map mirroring §6.1
- `"types"` and `"typesVersions"` so editors resolve `.d.ts` for every subpath
- `"engines"` declaring Node 18+
- `"publishConfig.provenance": true` for npm provenance signatures

---

## 9. Edge Cases

The implementation must explicitly handle:

### 9.1 Webhook verification

1. **Multi-signature header** — Stripe rotates secrets; `Stripe-Signature` may contain multiple `v1=…` segments. Verify against any.
2. **Whitespace in header** — header may contain stray whitespace; tolerate it.
3. **Schemed `v0` signatures** — only `v1` is HMAC-SHA256; ignore others without erroring.
4. **`UTF-8` body normalization** — never re-stringify the parsed JSON before verifying. Keep the raw bytes from `request.arrayBuffer()`.
5. **Body trailing newline** — Stripe doesn't add it; if a framework injects one, signature breaks. The handler reads `arrayBuffer()` directly to avoid this.
6. **Clock skew** — the `tolerance` window must be inclusive; reject only when `|now - ts| > tolerance`. Default 300 s.
7. **Negative timestamp** — reject (malformed).
8. **Empty / oversized payload** — reject without HMAC compute (DoS guard).
9. **Timing attacks** — comparison must be timing-safe even on Edge: implemented as constant-time byte XOR loop on `Uint8Array`.
10. **Test mode webhooks** — `whsec_test_…` works identically; no special branch.

### 9.2 Idempotency

11. **Race between two retries arriving simultaneously** — `setIfAbsent` must be atomic (`SET key value NX EX ttl` in Redis; `INSERT ON CONFLICT DO NOTHING` in Postgres).
12. **Handler succeeds, store write fails** — caller sees a 5xx; Stripe retries; the second attempt may run the handler again. Documented: handlers MUST be internally idempotent.
13. **Handler fails, retried** — on second arrival, store-key still absent (we only record after success in this strategy). The library's `withIdempotency` uses **set-then-run**: a key is reserved before the handler runs, but the handler signaling retryable failure throws `RetryableError` which clears the key.
14. **TTL too short** — Stripe retries for up to 3 days; default 7 days gives margin. Configurable.
15. **Replay outside Stripe** — bypass possible via custom storage policy (out of scope; documented).

### 9.3 Subscription state machine

16. **Status not in our union** — Stripe could add a new status (e.g., `paused` was added in 2022). Reducer must accept unknown statuses and pass them through with a structured warning.
17. **Out-of-order events** — webhook delivery is not ordered. Reducer compares `event.created` (or `subscription.updated`) against `state.updatedAt` and skips stale events.
18. **`current_period_end` rollover at midnight** — store as unix-seconds, never re-format with `Date` until display.
19. **Resumed subscription** — `paused → active` is a valid transition we must encode.
20. **Cancel-at-period-end** — `cancelAtPeriodEnd: true` while still `active` is normal; no transition fires until period ends.

### 9.4 Plans / features

21. **Unknown `priceId`** — `resolveFeatures` returns `null`; consumer narrows.
22. **Multiple plans share a feature** — features are a `Set` semantically; `resolveFeatures` returns the declared array verbatim, no dedup at runtime, but `FeatureOf<P>` union dedupes at type level.
23. **Caller passes a string not in literal union** — `(string & {})` widening allows it without breaking type inference; `resolveFeatures` returns `null` at runtime.
24. **Plan changes mid-period (proration)** — out of scope for this layer; helpers for proration preview live in a future `/billing` subpath.
25. **Re-define plans at runtime** — supported; `definePlans` is pure; brand prevents leaking raw config.

### 9.5 Cross-runtime

26. **`Buffer` doesn't exist** — never used. `Uint8Array` end-to-end.
27. **`crypto.subtle` is async** — verifier is `async`; documented.
28. **`Request` body can only be read once** — adapters call `request.arrayBuffer()` exactly once and pass bytes downstream.
29. **Edge Runtime forbids `node:crypto`** — verified at runtime via Edge tests in CI.
30. **Cloudflare Workers `KVNamespace` lacks atomic SET-IF-ABSENT** — `kv` adapter uses `get` + `put` with TTL; documented as best-effort with a small race window. Recommendation: pair with Durable Objects for strict guarantees.

### 9.6 TypeScript / DX

31. **Const-assertion forgotten on `definePlans`** — types degrade to `string`; `definePlans` accepts both but emits a `// @ts-expect-error: plans must be defined `as const`` ESLint rule shipped as a recommendation in README.
32. **`Stripe.Event` type drift across major versions** — peer-dep range pinned to `^15`; CI runs against the latest minor of each supported major (15, 16 if released).
33. **TS `< 5.0`** — declared via `typesVersions` to error on install; library uses `satisfies`, `const` type params, `using` declarations only where supported.
34. **CommonJS consumers** — dual emit guarantees `require('@paysuite/stripe-subscriptions/webhooks')` works; no top-level `await`.

### 9.7 Operational

35. **Logger throws inside dispatcher** — caught and discarded (logger errors must not break webhook flow).
36. **`onError` callback throws** — caught and discarded with a single console warning (best-effort observability).
37. **Very large event payloads** — Stripe caps at 256 KB; we don't impose a smaller cap, but the verifier streams over `Uint8Array` slices in the future.
38. **Multiple Stripe accounts** — one handler per secret; library is stateless so N handlers compose freely.

---

## 10. Roadmap (post-`0.1.0`)

Out of scope for the initial 0.1 cut, planned in subsequent minors:

- `/billing` — proration preview, upgrade/downgrade helpers, invoice item composition.
- `/usage` — meter ingestion for usage-based billing (tied to Stripe meters API).
- `/customer-portal` — typed wrappers for `billingPortal.sessions.create`.
- `/connect` — Stripe Connect / marketplaces support (separate state machine).
- React/Vue bindings — opt-in `@paysuite/stripe-subscriptions-react` companion package.

---

## 11. Quality Gates (CI required)

- `tsc --noEmit` clean under all four `tsconfig`s (lib, build, tests, examples).
- `vitest` ≥ 90 % statement coverage on `src/**` (excluding barrels & testing utils).
- `bundlesize` check — root `+ webhooks + events + idempotency` ≤ 6 KB min+gzip.
- `attw` (Are The Types Wrong?) — pass on every published artifact.
- `publint` — pass.
- `@edge-runtime/vm` smoke tests for the verifier.
- Real `stripe listen` E2E job — opt-in via `STRIPE_SECRET_KEY` env, runs on tags only.
