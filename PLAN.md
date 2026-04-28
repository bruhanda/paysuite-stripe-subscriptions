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
│   │   ├── transitions.ts            # valid transitions table + validateSubscriptionTransition()
│   │   ├── reducer.ts                # reduceSubscription(prev, event) — pure event-sourced reducer
│   │   └── transition-router.ts      # createTransitionRouter() — per-instance transition→effect routing
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
│   │   │   ├── index.ts              # ioredis / @upstash/redis adapter
│   │   │   └── README.md             # claim/commit semantics + Lua snippet
│   │   ├── kv/                       # subpath: ".../storage/kv"
│   │   │   ├── index.ts              # Cloudflare KV / Vercel KV adapter
│   │   │   └── README.md             # ⚠️ KV race window — pair with Durable Objects
│   │   ├── durable-objects/          # subpath: ".../storage/durable-objects"
│   │   │   └── index.ts              # ~30-line reference impl atop a DO class
│   │   └── postgres/                 # subpath: ".../storage/postgres"
│   │       └── index.ts              # pg / postgres / drizzle adapter
│   │
│   ├── testing/                      # subpath: "@paysuite/stripe-subscriptions/testing"
│   │   ├── index.ts                  # public barrel — code-only helpers (lean)
│   │   ├── factories.ts              # buildSubscription(), buildEvent()
│   │   ├── signing.ts                # signPayload() — produce valid signature for tests
│   │   ├── mock-store.ts             # spy-able IdempotencyStore (claim/commit-aware)
│   │   ├── cli-bridge.ts             # Stripe CLI → fixture capture helper
│   │   └── fixtures/                 # subpath: "@paysuite/stripe-subscriptions/testing/fixtures"
│   │       └── index.ts              # loadFixture(name) — dynamic import of JSON
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
| `src/state-machine/status.ts` | `SubscriptionStatus` literal union mirroring Stripe's 8 statuses. |
| `src/state-machine/transitions.ts` | Static table of valid transitions + `validateSubscriptionTransition(from, to)` returning `Result`. |
| `src/state-machine/reducer.ts` | `reduceSubscription(state, event)` — pure event-sourced reducer. |
| `src/state-machine/transition-router.ts` | `createTransitionRouter()` — per-instance routing of `(from, to)` pairs to effect functions. No module-level mutable state. |
| `src/plans/define.ts` | `definePlans({ pro: { priceId: 'price_…', features: [...] } } as const)` with `const` inference. |
| `src/plans/resolve.ts` | `resolveFeatures(plans, priceId)` returns the typed feature array. |
| `src/plans/types.ts` | The generics that make `priceId` autocompletion + feature inference work. |
| `src/idempotency/store.ts` | `IdempotencyStore` interface (`claim`, `commit`, `release`, `delete`) + `createMemoryStore()` reference impl. |
| `src/idempotency/guard.ts` | `withIdempotency(store, key, fn)` — claim → execute → commit/release. |
| `src/errors/base.ts` | `PaySuiteError extends Error` with `code`, `cause`, `details`. |
| `src/errors/codes.ts` | Exhaustive `ErrorCode` literal union — programmatic dispatch on errors. |
| `src/adapters/next/app-router.ts` | `createNextRouteHandler(opts)` returning `{ POST }` shaped for App Router. |
| `src/adapters/hono/index.ts` | `createHonoMiddleware(opts)` typed for Hono v4. |
| `src/storage/redis/index.ts` | `createRedisStore(client)` accepting both `ioredis` and `@upstash/redis`. Two-phase via `SET NX EX` + second key on commit. |
| `src/storage/kv/index.ts` | `createKvStore(kv)` for Cloudflare/Vercel KV. **Best-effort only** — KV lacks atomic SET-IF-ABSENT, see `/storage/kv/README.md` and pair with Durable Objects for strict guarantees. |
| `src/storage/durable-objects/index.ts` | `createDurableObjectStore(stub)` — reference impl using a DO class for serial atomic `claim/commit`. |
| `src/storage/postgres/index.ts` | `createPostgresStore(executor)` — claim via `INSERT ... ON CONFLICT DO NOTHING`, commit via `UPDATE`. |
| `src/testing/signing.ts` | `signPayload(secret, payload, timestamp?)` — produces a valid `Stripe-Signature` header for tests. |
| `src/testing/fixtures/index.ts` | `loadFixture(name)` — dynamic-import wrapper around `tests/fixtures/*.json`. |

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
 * Branded type for Stripe webhook signing secrets. Always `whsec_…`-prefixed.
 * Passing a publishable (`pk_…`) or restricted (`rk_…`) key is a compile error.
 * The `ConfigError` thrown at handler-construction time enforces this at runtime
 * for callers that bypass typing (e.g. `process.env` cast).
 */
export type WebhookSecret = `whsec_${string}`;

/**
 * Options for {@link verifyStripeSignature}.
 */
export interface VerifyOptions {
  /**
   * Raw request body as bytes — MUST be the exact bytes Stripe signed.
   * Read via `request.arrayBuffer()` (or framework equivalent) and pass
   * the result directly. NEVER `await req.text()` then re-encode — non-ASCII
   * payloads silently break HMAC after V8 string normalization (§9.1 #4).
   */
  payload: Uint8Array | ArrayBuffer;
  /** Value of the `Stripe-Signature` HTTP header. */
  header: string;
  /** Webhook signing secret from the Stripe Dashboard. */
  secret: WebhookSecret;
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
 * Escape hatch for callers that only have a string body (e.g. logging
 * pipelines that already decoded the request). UNSAFE for any non-ASCII
 * payload — V8 string normalization will silently mutate the bytes Stripe
 * signed and HMAC will fail. Whenever possible, use {@link verifyStripeSignature}
 * with the raw `ArrayBuffer` from `request.arrayBuffer()`.
 *
 * The unsafety is named at the call site so reviewers can grep for it.
 */
export function verifyStripeSignatureFromText(opts: {
  payload: string;
  header: string;
  secret: WebhookSecret;
  tolerance?: number;
  now?: () => number;
}): Promise<VerifyResult>;

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
  secret: WebhookSecret;
  /** A *sealed* dispatcher — call `.build()` on the builder before passing it in. */
  dispatcher: SealedDispatcher<E>;
  /** Store used to claim/commit processed `event.id`s. Defaults to in-memory (NOT for production). */
  store?: IdempotencyStore;
  /**
   * TTL (seconds) to retain *committed* event ids. Default 604_800 (7 days,
   * matching Stripe's retry window). The shorter in-flight claim TTL is
   * managed by the store.
   */
  commitTtl?: number;
  /** TTL (seconds) for the in-flight claim. Default 60. Should exceed worst-case handler runtime. */
  claimTtl?: number;
  tolerance?: number;
  /** Hook called when an event is skipped because it was already committed. */
  onDuplicate?: (eventId: string) => void;
  /** Hook called when an event arrives while another worker is in-flight on the same id. */
  onInFlight?: (eventId: string) => void;
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
 * The builder is **immutable**: every `.on()` returns a new dispatcher.
 * Call `.build()` to seal it and obtain a `SealedDispatcher` you can pass to
 * `createWebhookHandler`. `dispatch` is intentionally not on the builder —
 * sealing forces a single, unambiguous "registration is finished" point.
 *
 * @example
 * ```ts
 * const dispatcher = createDispatcher()
 *   .on('customer.subscription.updated', async (event) => {
 *     // event.data.object is Stripe.Subscription, fully typed
 *     console.log(event.data.object.status);
 *   })
 *   .onAny((event) => log('saw', event.type))
 *   .build();
 * ```
 */
export function createDispatcher(): EventDispatcher<never>;

export interface EventDispatcher<Registered extends StripeEventName = never> {
  /**
   * Register a handler for a specific event type. Compile error if `Name`
   * is already registered — re-registration would silently override the
   * earlier handler. Use `.onAny` for catch-all behavior instead.
   */
  on<Name extends Exclude<StripeEventName, Registered>>(
    name: Name,
    handler: (event: StripeEventOf<Name>) => Promise<void> | void
  ): EventDispatcher<Registered | Name>;

  /** Register a fallback handler invoked for every event after the typed handler runs. */
  onAny(handler: (event: Stripe.Event) => Promise<void> | void): EventDispatcher<Registered>;

  /** Seal the builder. The returned `SealedDispatcher` is what `createWebhookHandler` accepts. */
  build(): SealedDispatcher<Registered>;
}

/**
 * Sealed dispatcher: registration is closed, dispatch is available.
 * Returned exclusively by `EventDispatcher#build()`.
 */
export interface SealedDispatcher<Registered extends StripeEventName = never> {
  /** Routes an event to the registered handler (or `onAny` fallback). */
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
 * Named `validateSubscriptionTransition` (not `transition`) to avoid colliding
 * with the many user-land `transition()` helpers in routing/animation libs.
 *
 * @example
 * ```ts
 * const r = validateSubscriptionTransition('trialing', 'active');
 * if (r.ok) persist(r.value);
 * ```
 */
export function validateSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): Result<{ from: SubscriptionStatus; to: SubscriptionStatus }, InvalidTransitionError>;

/**
 * Reducer that derives a new subscription state from the previous state and a
 * Stripe event. Designed to be used inside your application's persistence
 * layer (Postgres write, Redis cache, etc.).
 *
 * Named `reduceSubscription` to avoid auto-import collisions with
 * `Array.prototype.reduce` and Redux conventions.
 */
export function reduceSubscription(
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
 * Per-instance transition router. Replaces the previous module-level
 * `onTransition()` free function — that design hid mutable state inside an
 * otherwise stateless library and made multi-Stripe-account setups (§9.7 #38)
 * effectively impossible.
 *
 * Each call to `createTransitionRouter` returns an independent router; tests
 * need no `reset()` and apps with two Stripe accounts can keep their effects
 * isolated.
 *
 * @example
 * ```ts
 * const router = createTransitionRouter()
 *   .on('trialing', 'active', async ({ subscription }) => {
 *     await sendWelcomeEmail(subscription.customerId);
 *   })
 *   .on('past_due', 'canceled', async ({ subscription }) => {
 *     await downgradeToFree(subscription.customerId);
 *   });
 *
 * await router.run({ from: prev.status, to: next.status, subscription: next });
 * ```
 */
export function createTransitionRouter(): TransitionRouter;

export interface TransitionRouter {
  /**
   * Register an effect for a *specific* transition pair. Effects are typed
   * by the exact `(From, To)` so `trialing→active` cannot accidentally fire
   * for a `past_due→active` recovery.
   */
  on<From extends SubscriptionStatus, To extends SubscriptionStatus>(
    from: From,
    to: To,
    effect: (ctx: TransitionContext<From, To>) => Promise<void> | void
  ): TransitionRouter;
  /** Run all effects whose `(from, to)` matches `ctx`. No-op if none match. */
  run(ctx: {
    from: SubscriptionStatus;
    to: SubscriptionStatus;
    subscription: SubscriptionState;
  }): Promise<void>;
}
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
 * **Asserting** feature check — assumes the price is known. Throws
 * `ConfigError(UNKNOWN_PRICE_ID)` for unknown ids. Use this on the inside of
 * trusted code paths where the price-id originates from your own plan config
 * or a verified webhook event.
 *
 * Split from {@link isFeatureEnabled} (which returns `null` for unknown ids)
 * so the two distinct outcomes — *unknown price* vs *feature disabled* — are
 * never collapsed into the same `false`.
 */
export function hasFeature<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: PriceIdOf<P>,
  feature: FeatureOf<P>
): boolean;

/**
 * **Tolerant** feature check — designed for runtime input (URLs, untrusted
 * DB rows). Returns:
 *  - `true`  — price is known, feature enabled
 *  - `false` — price is known, feature not enabled
 *  - `null`  — price is unknown (caller decides: log, default, deny)
 */
export function isFeatureEnabled<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: string,
  feature: FeatureOf<P>
): boolean | null;
```

### 2.6 Idempotency — `/idempotency`

> **Guarantee.** This library provides **de-duplicated, at-least-once**
> processing — *not* exactly-once. The two-phase `claim → commit` protocol
> below gives you single-execution under normal operation and bounded
> double-execution only when a worker crashes mid-handler. Handlers MUST
> still be internally idempotent for the rare retry-after-crash case. We
> deliberately do **not** market this as exactly-once because, per FLP,
> exactly-once across an HTTP boundary is impossible without coordination
> the host app must own (transactional outbox, etc.).

```ts
/**
 * Pluggable storage interface for de-duplicating webhook events.
 * Implementations exist for Redis, KV, Postgres, and in-memory (default).
 *
 * The protocol is two-phase:
 *   1. `claim()` reserves a short-TTL "in-flight" marker for the event id.
 *   2. The caller runs the handler.
 *   3. On success, `commit()` writes a long-TTL "done" marker.
 *      On retryable failure, `release()` clears the in-flight marker so
 *      Stripe's next retry can re-claim it.
 *
 * Implementations MUST be safe under concurrent calls — `claim` is the
 * atomic primitive (Redis `SET NX EX`, Postgres `INSERT … ON CONFLICT DO
 * NOTHING`, etc.).
 */
export interface IdempotencyStore {
  /**
   * Atomically determine the state of `key` and, if absent, take ownership.
   *
   * @returns
   *   - `'claimed'`   — caller now owns this key; proceed to handler.
   *   - `'committed'` — already processed successfully; SKIP the handler, return 200.
   *   - `'in-flight'` — another worker is currently processing; return 5xx so Stripe retries later.
   */
  claim(key: string, opts: { claimTtlSeconds: number }): Promise<ClaimState>;
  /** Promote a previously-claimed key to "committed" with a long TTL. */
  commit(key: string, opts: { commitTtlSeconds: number }): Promise<void>;
  /** Release a previously-claimed key without committing (for retryable failure). */
  release(key: string): Promise<void>;
  /** Best-effort delete of any record of `key`. Test utility. */
  delete(key: string): Promise<void>;
}

export type ClaimState = 'claimed' | 'committed' | 'in-flight';

/**
 * Wrap a function with two-phase claim/commit de-duplication.
 *
 * Behavior:
 *  - `claim` returns `'claimed'`  → run `fn`, then `commit` on success or `release` on throw, return `{ ran: true, value }`.
 *  - `claim` returns `'committed'` → SKIP `fn`, return `{ ran: false, reason: 'duplicate' }`.
 *  - `claim` returns `'in-flight'` → SKIP `fn`, return `{ ran: false, reason: 'in-flight' }`.
 *
 * The caller (typically `createWebhookHandler`) maps these to HTTP status:
 *   - `claimed` + commit success → 200
 *   - `committed` (duplicate)    → 200 (Stripe stops retrying)
 *   - `in-flight`                → 425 / 5xx (Stripe will retry)
 *   - handler throws             → `release`, then 5xx
 *
 * @example
 * ```ts
 * const result = await withIdempotency(store, `stripe:event:${event.id}`, async () => {
 *   await db.processSubscription(event);
 * });
 * if (!result.ran) log('skipped:', result.reason);
 * ```
 */
export function withIdempotency<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  opts?: { claimTtlSeconds?: number; commitTtlSeconds?: number }
): Promise<
  | { ran: true; value: T }
  | { ran: false; reason: 'duplicate' | 'in-flight' }
>;

/** Default in-memory store. NOT for production — replace with `redis`/`kv`/`postgres`. */
export function createMemoryStore(): IdempotencyStore;
```

### 2.7 Errors — `/errors`

```ts
/**
 * Stable, programmatic error codes. Backwards-compatible across minor versions.
 *
 * The const is `ErrorCodes` (plural) and the type is `ErrorCode` (singular).
 * Same-name const-and-type is legal but tooling-hostile — autoimport,
 * refactor-rename, and doc generators all stumble on the collision.
 */
export const ErrorCodes = {
  INVALID_SIGNATURE_FORMAT:    'INVALID_SIGNATURE_FORMAT',
  SIGNATURE_TIMESTAMP_TOO_OLD: 'SIGNATURE_TIMESTAMP_TOO_OLD',
  SIGNATURE_TIMESTAMP_IN_FUTURE: 'SIGNATURE_TIMESTAMP_IN_FUTURE',
  SIGNATURE_MISMATCH:          'SIGNATURE_MISMATCH',
  MISSING_SECRET:              'MISSING_SECRET',
  MALFORMED_PAYLOAD:           'MALFORMED_PAYLOAD',
  INVALID_TRANSITION:          'INVALID_TRANSITION',
  UNKNOWN_PRICE_ID:            'UNKNOWN_PRICE_ID',
  STORE_UNAVAILABLE:           'STORE_UNAVAILABLE',
  HANDLER_FAILED:              'HANDLER_FAILED',
  CONFIG_INVALID:              'CONFIG_INVALID',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

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

// /adapters/sveltekit
export function createSveltekitHandler(opts: WebhookHandlerOptions): (event: { request: Request }) => Promise<Response>;

// /adapters/nitro
export function createNitroHandler(opts: WebhookHandlerOptions): (request: Request) => Promise<Response>;
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

The `/testing` subpath is intentionally **lean** — only the small, code-only
helpers (factories, signing, spy store). Heavy fixture payloads live at the
separate subpath `/testing/fixtures` (§2.11) so a user importing `signPayload`
can never accidentally pull 30+ KB of JSON into their bundle.

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
  secret: WebhookSecret;
  payload: string | Uint8Array;
  timestamp?: number;
}): Promise<string>;

/** A spy-able IdempotencyStore — used in tests to assert duplicate handling. */
export function createSpyStore(): IdempotencyStore & {
  readonly calls: ReadonlyArray<{ method: 'claim' | 'commit' | 'release' | 'delete'; key: string }>;
  reset(): void;
};
```

### 2.11 Fixture payloads — `/testing/fixtures`

Real Stripe events are 4–10 KB minified — four of them inlined as a top-level
`const` would either blow the §6.1 "/testing ~1.5 KB" budget or, worse, be
pulled into a downstream user's bundle if their bundler can't prove the import
is dev-only. Putting them on a separate subpath makes the cost explicit and
opt-in.

Fixtures are stored as JSON files under `tests/fixtures/` and exposed via a
dynamic loader so a single fixture only costs what it costs:

```ts
/**
 * Lazy-load a captured Stripe event fixture by name. Implemented with dynamic
 * `import()` so each fixture is its own chunk — calling
 * `loadFixture('subscriptionCreated')` does not pull the others.
 */
export function loadFixture<N extends FixtureName>(name: N): Promise<FixtureOf<N>>;

export type FixtureName =
  | 'checkoutSessionCompleted'
  | 'subscriptionCreated'
  | 'subscriptionUpdated'
  | 'invoicePaymentFailed';

export type FixtureOf<N extends FixtureName> = {
  checkoutSessionCompleted: Stripe.Event & { type: 'checkout.session.completed' };
  subscriptionCreated:      Stripe.Event & { type: 'customer.subscription.created' };
  subscriptionUpdated:      Stripe.Event & { type: 'customer.subscription.updated' };
  invoicePaymentFailed:     Stripe.Event & { type: 'invoice.payment_failed' };
}[N];
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
┌────────────────────────────────┐
│ withIdempotency(store, id, fn) │
│ ─────────────────────────────  │
│  1. store.claim(id)            │
│        ├─ 'committed'  ──▶ 200 (skip — duplicate; onDuplicate hook)
│        ├─ 'in-flight'  ──▶ 425 (let Stripe retry; onInFlight hook)
│        └─ 'claimed'    ──▶ continue (we own the key)
│  2. dispatcher.dispatch(event) │
│        ├─ throws       ──▶ store.release(id); 500 + onError hook
│        └─ resolves     ──▶ continue
│  3. store.commit(id)           │
│        └─ committed    ──▶ 200 OK                                      │
└────────────────────────────────┘
```

**Semantics, called out plainly:**
- This is **de-duplicated, at-least-once** — see the §2.6 disclaimer.
- The `'in-flight'` result *does not* run the handler; it returns 5xx so
  Stripe retries after the worker that holds the claim either commits or
  the claim TTL expires. This bounds double-execution to "claim TTL outlived
  the worker" — a real but rare worker-crash window.
- `release()` on handler throw is best-effort. If the worker dies between
  throw and release, the claim simply expires after `claimTtlSeconds`.

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
| `./storage/kv` | Cloudflare/Vercel KV store (best-effort, see README) | ~0.2 KB |
| `./storage/durable-objects` | Cloudflare Durable Objects store (strict atomic claim) | ~0.3 KB |
| `./storage/postgres` | Postgres store | ~0.4 KB |
| `./testing` | Factories + signing + spy store (no fixtures) | ~1.5 KB |
| `./testing/fixtures` | Lazy `loadFixture(name)` — JSON loaded via dynamic `import()` | ~0.3 KB code + per-fixture JSON chunks |

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
    'storage/durable-objects/index': 'src/storage/durable-objects/index.ts',
    'storage/postgres/index': 'src/storage/postgres/index.ts',
    'testing/index': 'src/testing/index.ts',
    'testing/fixtures/index': 'src/testing/fixtures/index.ts',
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
| `zod` | `>=3.22.0 \|\| >=4.0.0` | Runtime-validating user-provided plans config in `definePlans` (when `validate: true`). Optional. v4 is supported — both majors share the API surface we use. | Marked in `peerDependenciesMeta.optional` — works without zod, validation no-op. |

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
6. **Clock skew (past and future)** — the `tolerance` window is symmetric: reject when `|now - ts| > tolerance`. That covers both stale signatures (`now - ts > tolerance` → `SIGNATURE_TIMESTAMP_TOO_OLD`) **and** future-dated signatures (`ts - now > tolerance` → `SIGNATURE_TIMESTAMP_IN_FUTURE`). Stripe shouldn't produce future-dated values, but a malicious actor predicting server skew might. Test matrix MUST include both directions plus a unit test for `ts > now + tolerance`. Default 300 s.
7. **Negative timestamp** — reject (malformed).
8. **Empty / oversized payload** — reject without HMAC compute (DoS guard).
9. **Timing attacks** — comparison must be timing-safe even on Edge: implemented as constant-time byte XOR loop on `Uint8Array`.
10. **Test mode webhooks** — `whsec_test_…` works identically; no special branch.

### 9.2 Idempotency

> **Honest framing.** This subsystem provides *de-duplicated, at-least-once* —
> not exactly-once. Exactly-once across an HTTP boundary is impossible without
> coordination the host app must own (transactional outbox pattern, etc.).
> Handlers MUST be internally idempotent for the worker-crash retry case.

11. **Race between two retries arriving simultaneously** — the `claim` primitive must be atomic (`SET key value NX EX ttl` in Redis; `INSERT ON CONFLICT DO NOTHING` in Postgres). Two simultaneous claims: exactly one wins (`'claimed'`), the other sees `'in-flight'` and returns 5xx so Stripe retries.
12. **Handler succeeds, commit write fails** — caller sees a 5xx; Stripe retries; on the next arrival, the in-flight key may still be present (`'in-flight'` → 5xx again until the claim TTL expires) or already expired (re-claim, handler runs again). Documented: handlers MUST be internally idempotent.
13. **Handler fails, retried** — on throw, `withIdempotency` calls `store.release(key)` so the next arrival can immediately re-claim. If the worker dies before `release` runs, the claim simply expires after `claimTtlSeconds` and the next retry proceeds. This is the *bounded* double-execution window — sized by `claimTtlSeconds` (default 60 s, configurable). The previous "set-then-run with `RetryableError` clearing the key" design was at-least-once with best-effort dedup; the explicit two-key `claim → commit` protocol is a strictly stronger guarantee and is what the docs now describe.
14. **TTL too short** — Stripe retries for up to 3 days; the *commit* TTL defaults to 7 days for margin. The *claim* TTL defaults to 60 s and should exceed worst-case handler runtime; if your handler can run >60 s, raise `claimTtl` accordingly.
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
30. **Cloudflare Workers `KVNamespace` lacks atomic SET-IF-ABSENT** — the `kv` adapter uses `get` + `put` with TTL; this is best-effort with a small race window. **The warning + the Durable-Objects-pairing recommendation lives in `src/storage/kv/README.md`** so users land on it before they ship a race to production. A reference `/storage/durable-objects` adapter (~30 lines atop a DO class) ships in the same release for users who need strict atomicity on Cloudflare.

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

---

## Review Changes

This section captures Mykhailo Kryvytskyi's REQUEST_CHANGES review on PR #1
and how each point was resolved. Reviewer's full comments are on the PR.

### Major

1. **`VerifyOptions.payload: string` contradicts §9.1 #4** (correctness)
   - **Agreed.** Accepting `string` round-trips through V8 string normalization and
     silently breaks HMAC for non-ASCII payloads.
   - **Change:** Dropped `string` from `VerifyOptions.payload`. Added a separately-named
     `verifyStripeSignatureFromText()` so the unsafety is visible at the call site.
   - **Sections modified:** §2.2.

2. **"Exactly-once" honesty** (honesty)
   - **Agreed.** The set-then-clear-on-retry strategy is at-least-once with best-effort
     dedup. CTOs cited this as a buy-vs-build factor — we either deliver the strict
     guarantee or stop claiming it.
   - **Change:** (a) reframed the docs as "de-duplicated, at-least-once" with an
     explicit disclaimer in §2.6 and §9.2, AND (b) adopted the stronger two-phase
     `claim → commit → release` protocol so single-execution holds under normal
     operation and double-execution is bounded to "claim TTL outlived a crashed worker".
   - **Sections modified:** §2.6 (full rewrite), §3.2 (data flow), §9.2 #11–14, §1.1
     (idempotency file purposes), §2.2 (`WebhookHandlerOptions` → `claimTtl`/`commitTtl`,
     added `onInFlight`).

3. **`EventDispatcher.on` allows duplicate registration; "immutable builder" claim is contradicted by `dispatch` on every intermediate** (type-safety + API shape)
   - **Agreed on both halves.**
   - **Change:** Tightened bound to `Name extends Exclude<StripeEventName, Registered>`
     so re-registration is a compile error. Removed `dispatch` from the builder; added
     a new `SealedDispatcher<Registered>` returned by `.build()` — `createWebhookHandler`
     now accepts a sealed dispatcher only. The "immutable, builder-style" claim now
     matches reality.
   - **Sections modified:** §2.3, §2.2 (`WebhookHandlerOptions.dispatcher` → `SealedDispatcher`).

4. **`onTransition` is a top-level mutable singleton** (architecture)
   - **Agreed.** Top-level free function with module-level state contradicts §6.2
     and breaks multi-Stripe-account use (§9.7 #38).
   - **Change:** Replaced with `createTransitionRouter()` returning a per-instance
     `TransitionRouter` with `.on(from, to, fn)` and `.run(ctx)`. No module-level
     state, trivially testable, multi-account-safe.
   - **Sections modified:** §2.4, §1 (file map: `effects.ts` → `transition-router.ts`),
     §1.1 (file purposes).

5. **Inline `fixtures` const blows the `/testing` bundle budget** (bundle)
   - **Agreed.** Real Stripe events are 4–10 KB each; four inlined exports either
     blow the §6.1 1.5 KB budget or get pulled into downstream user bundles.
   - **Change:** Moved fixtures to a separate subpath `@paysuite/stripe-subscriptions/testing/fixtures`
     with a dynamic-import-backed `loadFixture(name)` so each fixture is its own
     chunk. `/testing` stays lean.
   - **Sections modified:** §2.10 (removed `fixtures` const), new §2.11
     (`/testing/fixtures`), §1 (file map), §6.1 (entry table), §6.3 (tsup entries),
     `package.json` (added `./testing/fixtures` export and `typesVersions` entry).

### Minor

6. **`secret: string` should be `whsec_${string}`** (type-safety)
   - **Agreed.** Compile-time guard against `pk_…`/`rk_…` mistakes is cheap.
   - **Change:** Added `WebhookSecret = \`whsec_${string}\`` brand and applied it to
     `VerifyOptions`, `WebhookHandlerOptions`, `verifyStripeSignatureFromText`, and
     `signPayload`. Plan also notes a runtime `ConfigError` at handler construction
     for callers that bypass typing (e.g. `process.env` cast).
   - **Sections modified:** §2.2, §2.10, §5.1 (already covered by "programmer error
     → throw at startup" row).

7. **`hasFeature` collapses unknown-price and feature-disabled into the same `false`** (type-safety)
   - **Agreed.** Distinct outcomes deserve distinct signals.
   - **Change:** Split into two functions:
     `hasFeature(plans, priceId: PriceIdOf<P>, feature)` — asserting variant, throws
     `ConfigError(UNKNOWN_PRICE_ID)` for unknown ids.
     `isFeatureEnabled(plans, priceId: string, feature)` — tolerant variant, returns
     `boolean | null`.
   - **Sections modified:** §2.5.

8. **`IdempotencyStore.has(key)` is dead surface** (api-surface)
   - **Agreed.** Removed entirely as part of the claim/commit redesign.
   - **Sections modified:** §2.6, §1.1, §2.10 (`createSpyStore` call list updated to
     `'claim' | 'commit' | 'release' | 'delete'`).

9. **§7.2 zod range disagrees with `package.json`** (consistency)
   - **Agreed.** v4 is shipped — widen the manifest, not the plan.
   - **Change:** `package.json` peer `"zod": ">=3.22.0 || >=4.0.0"`. Plan §7.2 reformatted
     to match (`>=3.22.0 || >=4.0.0`).
   - **Sections modified:** §7.2, `package.json` line 172.

10. **Add explicit unit test for `ts > now + tolerance`** (correctness)
    - **Agreed.** Symmetric tolerance must reject future-dated timestamps too.
    - **Change:** Folded into §9.1 #6 with the explicit test requirement; added
      `SIGNATURE_TIMESTAMP_IN_FUTURE` to `ErrorCodes` so the failure is observable
      separately from a stale signature.
    - **Sections modified:** §9.1 #6, §2.7.

11. **`reduce` and `transition` are too generic as top-level names** (naming)
    - **Agreed.** Both collide with widely-used identifiers on auto-import.
    - **Change:** Renamed `reduce` → `reduceSubscription`, `transition` →
      `validateSubscriptionTransition`.
    - **Sections modified:** §2.4, §1 (file map), §1.1 (file purposes).

12. **§2.6 JSDoc references undefined `withRetry`** (docs)
    - **Agreed.** Removed.
    - **Change:** §2.6 JSDoc rewritten without the dangling reference; semantics now
      describe `release` on throw rather than a phantom `withRetry`.
    - **Sections modified:** §2.6.

13. **KV race recommendation belongs in `/storage/kv` README; ship `/storage/durable-objects` reference** (edge-runtime)
    - **Agreed on both.**
    - **Change:** §9.5 #30 now points at `src/storage/kv/README.md` as the canonical
      warning location. Added `/storage/durable-objects` subpath, file, package
      export, tsup entry, and bundle row. (README content itself ships with the
      implementation in the next phase.)
    - **Sections modified:** §1 (file map adds `kv/README.md` and `durable-objects/`),
      §1.1, §6.1, §6.3, §9.5 #30, `package.json`.

14. **Same-name `ErrorCode` const-and-type is tooling-hostile** (naming)
    - **Agreed.**
    - **Change:** Const renamed to `ErrorCodes`; the union type stays `ErrorCode`.
    - **Sections modified:** §2.7.

15. **`setIfAbsent` rename to `tryClaim`/`tryAcquire`** (naming, optional)
    - **Agreed and folded into the major-issue-2 redesign.** The new method is named
      `claim()`, returning a richer `'claimed' | 'committed' | 'in-flight'` state
      rather than a boolean. This matches Redis/Postgres community vocabulary and
      makes the lock-acquisition semantics explicit.
    - **Sections modified:** §2.6 (covered by major-issue-2 rewrite).

### What was NOT changed

None. Every reviewer point led to a concrete change in either PLAN.md or
`package.json`. The two places where I extended the reviewer's suggestion:

- For major-issue-2 I went with both (a) reframe docs *and* (b) implement the stronger
  protocol, instead of picking only one. Reviewer offered them as alternatives; doing
  both gives us the honest framing today and the strict guarantee that backs it up.
- For minor-issue-13 I added a dedicated `/storage/durable-objects` subpath rather
  than merely treating it as a recommendation, because the reviewer noted it's
  ~30 lines and users on Cloudflare will need it.
