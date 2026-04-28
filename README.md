# @paysuite/stripe-subscriptions

[![npm version](https://img.shields.io/npm/v/@paysuite/stripe-subscriptions.svg)](https://www.npmjs.com/package/@paysuite/stripe-subscriptions)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@paysuite/stripe-subscriptions)](https://bundlephobia.com/package/@paysuite/stripe-subscriptions)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

TypeScript-first, Edge-Runtime-ready toolkit for Stripe Billing subscriptions — webhook
verification, type-safe event dispatch, a subscription state machine, declarative
plan→feature mapping, and pluggable idempotency.

## Why this exists

The official `stripe` SDK is low-level. Every team integrating Stripe Billing rewrites
the same five pieces by hand: cross-runtime webhook signature verification (Node, Bun,
Vercel/Next.js Edge, Cloudflare Workers), idempotent webhook processing, mapping
`Price IDs` to internal feature flags, modelling the `trialing → active → past_due →
canceled` state machine, and dispatching to typed handlers. Each rewrite ships the same
bugs (timestamp tolerance, dedup race windows, body re-stringification breaking HMAC).

`@paysuite/stripe-subscriptions` ships those primitives once, treeshakes to ~5 KB for a
typical Edge handler, and stays a library — not a boilerplate, not a SaaS, not a
framework.

## Features

- **Cross-runtime webhook verification** — single code path for Node 18+, Bun, Deno,
  Vercel/Next.js Edge Runtime, and Cloudflare Workers, built entirely on Web Crypto.
- **Two-phase idempotency** — `claim → run → commit/release` with pluggable storage
  (in-memory, Redis, Postgres, Cloudflare KV, Cloudflare Durable Objects).
- **Type-safe event dispatcher** — register handlers per event name; `event.data.object`
  is narrowed precisely (e.g. `Stripe.Subscription` for `customer.subscription.updated`).
  Re-registration is a compile error.
- **Subscription state machine** — pure event-sourced reducer, validated transition
  table, per-instance transition router for side effects.
- **Declarative plan → feature mapping** — `definePlans({ ... } as const)` infers the
  feature union, price-id literals, and plan names; no manual generics.
- **Framework adapters** — Next.js (App + Pages Router), Hono, Fastify, Express,
  SvelteKit, Nitro/Nuxt — each adapter is a thin, opt-in subpath.
- **Structured errors** — every error carries a stable `code`, optional structured
  `details`, and a JSON-serializable `toJSON()` for observability stacks.
- **Testing utilities** — factories for events and subscriptions, a `signPayload`
  helper that produces real Stripe-format signatures, and a spy-able idempotency store.
- **Tree-shakeable** — `"sideEffects": false`, every concern lives behind its own
  subpath export, dual ESM + CJS emit.

## Quick Start

```ts
// app/api/stripe/webhooks/route.ts (Next.js App Router)
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createNextRouteHandler } from '@paysuite/stripe-subscriptions/adapters/next';

export const runtime = 'edge';

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (event) => {
    await db.subscriptions.upsert(event.data.object);
  })
  .build();

export const { POST } = createNextRouteHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher,
});
```

## Installation

```bash
npm install @paysuite/stripe-subscriptions stripe
# or
pnpm add @paysuite/stripe-subscriptions stripe
# or
bun add @paysuite/stripe-subscriptions stripe
```

`stripe` is a peer dependency. `zod` is an optional peer used only when you opt into
runtime-validated configs.

## API Reference

The library has one entry per concern. Subpath imports are the recommended path; the
root entry only re-exports `VERSION` and a few shared types.

### Root — `@paysuite/stripe-subscriptions`

| Export        | Kind  | Description                                      |
|---------------|-------|--------------------------------------------------|
| `VERSION`     | const | Library version string, kept in sync with `package.json`. |
| `PaySuiteError` | type  | Type-only re-export of the base error class — import the value from `/errors`. |
| `Result`, `Ok`, `Err` | types | Discriminated-union utility types used throughout the library. |

---

### `@paysuite/stripe-subscriptions/webhooks`

#### `verifyStripeSignature(opts) => Promise<VerifyResult>`

Verify a Stripe webhook signature using HMAC-SHA256 over the canonical
`${timestamp}.${payload}` string. Runs identically in Node 18+, Bun, Deno, Edge Runtime
and Cloudflare Workers — implemented entirely on Web Crypto.

```ts
type VerifyOptions = {
  payload: Uint8Array | ArrayBuffer; // raw bytes — never re-encoded JSON
  header: string;                     // Stripe-Signature header value
  secret: `whsec_${string}`;
  tolerance?: number;                 // seconds; default 300
  now?: () => number;                 // epoch milliseconds; default Date.now
};

type VerifyResult =
  | { ok: true; event: Stripe.Event; receivedAt: number }
  | { ok: false; error: SignatureVerificationError };
```

```ts
import { verifyStripeSignature } from '@paysuite/stripe-subscriptions/webhooks';

const result = await verifyStripeSignature({
  payload: await req.arrayBuffer(),
  header: req.headers.get('stripe-signature') ?? '',
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
});
if (!result.ok) return new Response(result.error.message, { status: 400 });
console.log('Verified event:', result.event.type);
```

> Always pass the raw `ArrayBuffer` from `req.arrayBuffer()`. Calling `req.text()` and
> re-encoding silently breaks HMAC for non-ASCII payloads after V8 string normalization.

#### `verifyStripeSignatureFromText(opts) => Promise<VerifyResult>`

Escape hatch for callers that only have the body as a string. UNSAFE for non-ASCII
payloads — prefer `verifyStripeSignature` whenever possible.

#### `parseEvent(rawPayload) => Result<Stripe.Event, PaySuiteError>`

Parse a verified raw payload (bytes or string) into a typed `Stripe.Event`. Performs
structural validation — `id`, `type`, and `data.object` must be present. Returns
`Err(MALFORMED_PAYLOAD)` for invalid UTF-8, invalid JSON, or non-Stripe shapes.

```ts
import { parseEvent } from '@paysuite/stripe-subscriptions/webhooks';

const r = parseEvent(await req.arrayBuffer());
if (r.ok) console.log(r.value.type);
```

#### `createWebhookHandler(opts) => (request: Request) => Promise<Response>`

Compose verification, idempotency, and dispatch into a single Web-standard handler.
This is the function every framework adapter wraps.

```ts
type WebhookHandlerOptions = {
  secret: `whsec_${string}`;
  dispatcher: SealedDispatcher;
  store?: IdempotencyStore;        // defaults to in-memory (NOT for production)
  commitTtl?: number;              // seconds; default 604_800 (7 days)
  claimTtl?: number;               // seconds; default 60
  tolerance?: number;              // seconds; default 300
  inFlightStatus?: number;         // HTTP status when another worker holds the claim; default 503
  onDuplicate?: (eventId: string) => void;
  onInFlight?: (eventId: string) => void;
  onError?: (error: unknown, event: Stripe.Event) => void;
  logger?: { warn(msg: string, ctx?: object): void; error(msg: string, ctx?: object): void };
};
```

```ts
import { createWebhookHandler } from '@paysuite/stripe-subscriptions/webhooks';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createRedisStore } from '@paysuite/stripe-subscriptions/storage/redis';
import { Redis } from 'ioredis';

const handler = createWebhookHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher: createDispatcher()
    .on('customer.subscription.updated', async (e) => save(e.data.object))
    .build(),
  store: createRedisStore(new Redis(process.env.REDIS_URL!)),
});

// handler is a (request: Request) => Promise<Response>
```

#### `parseSignatureHeader(header) => ParsedSignatureHeader | null`

Low-level parser for the `Stripe-Signature` header. Tolerates whitespace and multiple
`v1=` segments (Stripe rotates signing secrets). Returns `null` on malformed input.

---

### `@paysuite/stripe-subscriptions/events`

#### `createDispatcher() => EventDispatcher<never>`

Build a type-safe event router. Each `.on()` returns a new dispatcher whose phantom
parameter accumulates the registered events — re-registering the same event is a
compile error. Call `.build()` to seal the registration surface.

Supported event names:

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
customer.subscription.paused
customer.subscription.resumed
invoice.created
invoice.paid
invoice.payment_failed
invoice.payment_succeeded
invoice.upcoming
checkout.session.completed
checkout.session.expired
```

Other event names still flow through `.onAny()`.

```ts
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (event) => {
    // event.data.object is Stripe.Subscription, fully typed.
    console.log(event.data.object.status);
  })
  .onAny((event) => log('saw', event.type))
  .build();

await dispatcher.dispatch(event);
```

> Handlers run **strictly sequentially** in registration order — the typed handler
> first, then each `onAny` in order. If you need parallel work, fan out from inside
> a single handler with `Promise.all`.

#### `isSubscriptionEvent(event)`, `isInvoiceEvent(event)`, `isCheckoutSessionEvent(event)`

Type guards that narrow `Stripe.Event` to the corresponding sub-union:

```ts
if (isSubscriptionEvent(event)) {
  // event.data.object is Stripe.Subscription here.
}
```

#### `StripeEventName`, `StripeEventOf<N>`

Exported types — `StripeEventName` is the closed literal union of supported events,
`StripeEventOf<N>` extracts the precise event variant for a given name.

---

### `@paysuite/stripe-subscriptions/state-machine`

#### `SubscriptionStatus`, `SUBSCRIPTION_STATUSES`

Closed literal union mirroring Stripe's eight subscription statuses, plus an iterable
runtime list:

```
'incomplete' | 'incomplete_expired' | 'trialing' | 'active'
| 'past_due' | 'canceled' | 'unpaid' | 'paused'
```

#### `VALID_TRANSITIONS`, `validateSubscriptionTransition(from, to)`

A frozen table of allowed transitions plus a pure validator that returns `Result`.
Same-status transitions (`active → active`) are always allowed (webhooks can fire for
non-status updates such as metadata changes).

```ts
import { validateSubscriptionTransition } from '@paysuite/stripe-subscriptions/state-machine';

const r = validateSubscriptionTransition('trialing', 'active');
if (r.ok) await persist(r.value);
```

#### `reduceSubscription(prev, event) => SubscriptionState`

Pure event-sourced reducer. Derives the next persistence-ready
`SubscriptionState` from the previous state (or `null` on first-seen) and a
`customer.subscription.{created|updated|deleted}` event. Out-of-order events are
dropped.

```ts
type SubscriptionState = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  currentPeriodStart: number;     // unix-seconds
  currentPeriodEnd: number;       // unix-seconds
  cancelAtPeriodEnd: boolean;
  trialEnd: number | null;        // unix-seconds, or null
  updatedAt: number;              // unix-seconds — high-water mark
};
```

```ts
import { reduceSubscription } from '@paysuite/stripe-subscriptions/state-machine';

const next = reduceSubscription(prev, event);
await db.upsertSubscription(next);
```

#### `createTransitionRouter() => TransitionRouter`

Per-instance router from `(from, to)` status pairs to typed effect functions. No
module-level mutable state — each Stripe account / test gets its own router.

```ts
import { createTransitionRouter } from '@paysuite/stripe-subscriptions/state-machine';

const router = createTransitionRouter()
  .on('trialing', 'active', async ({ subscription }) => {
    await sendWelcomeEmail(subscription.customerId);
  })
  .on('past_due', 'canceled', async ({ subscription }) => {
    await downgradeToFree(subscription.customerId);
  });

await router.run({ from: prev.status, to: next.status, subscription: next });
```

---

### `@paysuite/stripe-subscriptions/plans`

#### `definePlans(plans) => PlansConfig<P>`

Define your application's plans as a `const` object. The returned value is the same
object with a virtual brand attached at the type level — at runtime nothing changes.

```ts
import { definePlans, type FeatureOf } from '@paysuite/stripe-subscriptions/plans';

const plans = definePlans({
  free: { priceId: 'price_free', features: ['basic_export'] },
  pro:  { priceId: 'price_1Oabc', features: ['basic_export', 'custom_domain'] },
} as const);

type Feature = FeatureOf<typeof plans>;
//   ^? 'basic_export' | 'custom_domain'
```

#### `resolveFeatures(plans, priceId) => readonly Feature[] | null`

Resolve a Stripe price id to its declared feature list. Returns `null` for unknown
ids — narrow before use.

#### `hasFeature(plans, priceId, feature) => boolean`

**Asserting** check — throws `ConfigError(UNKNOWN_PRICE_ID)` for unknown ids. Use this
inside trusted code paths where the price id originates from your own plan config.

#### `isFeatureEnabled(plans, priceId, feature) => boolean | null`

**Tolerant** check — returns `null` for unknown ids so callers can choose their own
default (log, deny, fall back).

#### `PlanNameOf<P>`, `PriceIdOf<P>`, `FeatureOf<P>`

Generic helpers to extract the plan-name union, price-id literal union, and feature
union from a `PlansConfig`.

---

### `@paysuite/stripe-subscriptions/idempotency`

#### `IdempotencyStore`, `ClaimState`

The pluggable storage interface:

```ts
type ClaimState = 'claimed' | 'committed' | 'in-flight';

interface IdempotencyStore {
  claim(key: string, opts: { claimTtlSeconds: number }): Promise<ClaimState>;
  commit(key: string, opts: { commitTtlSeconds: number }): Promise<void>;
  release(key: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Implementations ship under `/storage/*` (memory, Redis, Postgres, KV, Durable Objects).

#### `withIdempotency(store, key, fn, opts?) => Promise<WithIdempotencyResult<T>>`

The two-phase guard. Used internally by `createWebhookHandler` and exported for any
other once-only operation you want to coordinate.

- `'claimed'` → run `fn`; `commit` on success; `release` on throw and re-throw.
- `'committed'` → skip `fn`; return `{ ran: false, reason: 'duplicate' }`.
- `'in-flight'` → skip `fn`; return `{ ran: false, reason: 'in-flight' }`.

```ts
import { withIdempotency } from '@paysuite/stripe-subscriptions/idempotency';

const r = await withIdempotency(store, `stripe:event:${event.id}`, async () => {
  await db.processSubscription(event);
});
if (!r.ran) log('skipped', r.reason);
```

> **Honest framing.** This subsystem provides *de-duplicated, at-least-once* — not
> exactly-once. Handlers must be internally idempotent for the worker-crash retry case.
> See the *Idempotency semantics* section below for the bounded double-execution
> window and the stolen-claim hazard.

#### `createMemoryStore(opts?)`

Default in-memory store — single-process only. Replace with Redis / Postgres /
Durable Objects before deploying.

#### `DEFAULT_CLAIM_TTL_SECONDS`, `DEFAULT_COMMIT_TTL_SECONDS`

Default TTLs — 60 seconds for the in-flight claim, 7 days for the commit marker.

---

### `@paysuite/stripe-subscriptions/errors`

Every error this library emits extends `PaySuiteError` and carries a stable `code`
plus optional `details`. Errors are JSON-serializable via `toJSON()`.

| Class | Codes |
|---|---|
| `PaySuiteError` | base class — superclass of every error below |
| `SignatureVerificationError` | `INVALID_SIGNATURE_FORMAT`, `SIGNATURE_TIMESTAMP_TOO_OLD`, `SIGNATURE_TIMESTAMP_IN_FUTURE`, `SIGNATURE_MISMATCH`, `MALFORMED_PAYLOAD` |
| `InvalidTransitionError` | `INVALID_TRANSITION` |
| `ConfigError` | `CONFIG_INVALID`, `MISSING_SECRET`, `UNKNOWN_PRICE_ID` |
| `StoreError` | `STORE_UNAVAILABLE` |
| `HandlerError` | `HANDLER_FAILED` |

```ts
import { PaySuiteError } from '@paysuite/stripe-subscriptions/errors';

try {
  await handler(request);
} catch (err) {
  if (err instanceof PaySuiteError) {
    logger.error('paysuite failure', err.toJSON());
  }
  throw err;
}
```

---

### Storage adapters

All four production adapters implement the same `IdempotencyStore` interface. Pass
the result to `createWebhookHandler({ store })`.

#### `/storage/memory` — `createMemoryStore(opts?)`

Single-process only. Useful for local dev and unit tests; emphatically **not** for
multi-worker deployments. The internal map is bounded — `maxKeys` defaults to 10 000;
expired entries are swept on every claim, then oldest-committed entries are evicted.

#### `/storage/redis` — `createRedisStore(client)`

Atomic claim via `SET … NX EX`. Compatible with `ioredis` out of the box; for
`@upstash/redis` wrap the client in a five-line shim that translates positional
arguments to its options-object API.

```ts
import { Redis } from 'ioredis';
import { createRedisStore } from '@paysuite/stripe-subscriptions/storage/redis';

const store = createRedisStore(new Redis(process.env.REDIS_URL!));
```

#### `/storage/postgres` — `createPostgresStore(executor, opts?)`

Atomic claim via `INSERT … ON CONFLICT DO NOTHING`. Expired claims can be safely
stolen on a follow-up update. Accepts any client wrapped to a tiny `SqlExecutor`
shape (`node-postgres`, `pg-promise`, `postgres`, drizzle's raw escape hatch).

```sql
CREATE TABLE paysuite_idempotency (
  key text PRIMARY KEY,
  status text NOT NULL,
  expires_at timestamptz NOT NULL
);
```

```ts
import { Pool } from 'pg';
import { createPostgresStore } from '@paysuite/stripe-subscriptions/storage/postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = createPostgresStore({
  query: (t, v) => pool.query(t, v as unknown[]),
});
```

The `table` option is matched against `/^[a-zA-Z_][a-zA-Z0-9_]*$/` before being
interpolated into SQL — invalid identifiers throw at construction time.

#### `/storage/kv` — `createKvStore(kv)`

Cloudflare Workers KV / Vercel KV. **Best-effort only** — KV lacks atomic
SET-IF-ABSENT, so two concurrent workers can both observe the key as absent. Pair
with `/storage/durable-objects` (or document handlers as internally idempotent).

#### `/storage/durable-objects` — `createDurableObjectStore(stub)`

Strict atomic claim via a Durable Object class. The DO is single-threaded per id, so
claim → commit is serialized. The package documents a ~30-line reference DO class.

---

### Testing — `@paysuite/stripe-subscriptions/testing`

#### `buildSubscription(overrides?) => Stripe.Subscription`

Build a structurally-valid `Stripe.Subscription` for unit tests. Each call returns
fresh nested objects so test mutation cannot leak between tests.

#### `buildEvent(type, object, overrides?) => StripeEventOf<type>`

Build a precisely-typed `Stripe.Event` of a given type with an embedded `data.object`.

```ts
import { buildSubscription, buildEvent } from '@paysuite/stripe-subscriptions/testing';

const event = buildEvent(
  'customer.subscription.updated',
  buildSubscription({ status: 'past_due' }),
);
```

#### `signPayload(opts) => Promise<string>`

Produce a valid `Stripe-Signature` header for an arbitrary payload — useful for
unit-testing your webhook handler without spinning up `stripe listen`.

```ts
import { signPayload } from '@paysuite/stripe-subscriptions/testing';

const header = await signPayload({
  secret: 'whsec_test',
  payload: JSON.stringify(event),
});
```

#### `createSpyStore() => SpyStore`

A spy-able `IdempotencyStore` that records every `claim` / `commit` / `release` /
`delete` call and delegates to an in-memory store.

#### `createCliBridge() => CliBridge`

In-memory pub/sub between captured `stripe listen --print-json` events and your test
assertions.

---

### Framework adapters

Each adapter is a thin wrapper over `createWebhookHandler` shaped for the framework's
conventions. Every adapter accepts the same `WebhookHandlerOptions`.

## Framework guides

### Next.js — App Router (Edge Runtime)

```ts
// app/api/stripe/webhooks/route.ts
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createNextRouteHandler } from '@paysuite/stripe-subscriptions/adapters/next';

export const runtime = 'edge';

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (event) => {
    await save(event.data.object);
  })
  .build();

export const { POST } = createNextRouteHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher,
});
```

### Next.js — Pages Router

```ts
// pages/api/stripe/webhooks.ts
import {
  createNextApiHandler,
  config,
} from '@paysuite/stripe-subscriptions/adapters/next';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';

export { config }; // disables Next's default body parser — required

const dispatcher = createDispatcher()
  .on('invoice.payment_failed', async (event) => notifyOps(event))
  .build();

export default createNextApiHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher,
});
```

### Hono

```ts
import { Hono } from 'hono';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createHonoMiddleware } from '@paysuite/stripe-subscriptions/adapters/hono';

const app = new Hono();
const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (e) => save(e.data.object))
  .build();

app.post(
  '/stripe/webhooks',
  createHonoMiddleware({
    secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
    dispatcher,
  }),
);
```

### Express

Stripe webhooks need the raw body, so mount `express.raw({ type: 'application/json' })`
on the webhook path *before* this middleware — without it Express's default JSON
parser will mutate the bytes Stripe signed.

```ts
import express from 'express';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createExpressMiddleware } from '@paysuite/stripe-subscriptions/adapters/express';

const app = express();
const dispatcher = createDispatcher()
  .on('checkout.session.completed', async (e) => fulfilOrder(e.data.object))
  .build();

app.post(
  '/stripe/webhooks',
  express.raw({ type: 'application/json' }),
  createExpressMiddleware({
    secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
    dispatcher,
  }),
);
```

### Fastify

```ts
import Fastify from 'fastify';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createFastifyPlugin } from '@paysuite/stripe-subscriptions/adapters/fastify';

const app = Fastify();

// Deliver the raw bytes — Stripe signed them, not the parsed JSON.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body),
);

const dispatcher = createDispatcher()
  .on('invoice.paid', async (e) => recordRevenue(e.data.object))
  .build();

app.post(
  '/stripe/webhooks',
  createFastifyPlugin({
    secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
    dispatcher,
  }),
);
```

### SvelteKit

```ts
// src/routes/stripe/webhooks/+server.ts
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createSveltekitHandler } from '@paysuite/stripe-subscriptions/adapters/sveltekit';

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (e) => save(e.data.object))
  .build();

export const POST = createSveltekitHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher,
});
```

### Nitro / Nuxt

```ts
// server/api/stripe/webhooks.post.ts
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createNitroHandler } from '@paysuite/stripe-subscriptions/adapters/nitro';

const dispatcher = createDispatcher()
  .on('customer.subscription.deleted', async (e) => archive(e.data.object))
  .build();

const handler = createNitroHandler({
  secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
  dispatcher,
});

export default defineEventHandler(async (event) => {
  const response = await handler(toWebRequest(event));
  return sendWebResponse(event, response);
});
```

### Cloudflare Workers

```ts
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { createWebhookHandler } from '@paysuite/stripe-subscriptions/webhooks';
import { createDurableObjectStore } from '@paysuite/stripe-subscriptions/storage/durable-objects';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const store = createDurableObjectStore(
      env.STRIPE_DEDUPE.get(env.STRIPE_DEDUPE.idFromName('stripe-dedupe')),
    );
    const handler = createWebhookHandler({
      secret: env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
      dispatcher: createDispatcher()
        .on('customer.subscription.updated', async (e) => save(e.data.object))
        .build(),
      store,
    });
    return handler(req);
  },
};
```

## Configuration options

`createWebhookHandler` (and every framework adapter that wraps it) accepts these
options:

| Option           | Type                                              | Default   | Description |
|------------------|---------------------------------------------------|-----------|-------------|
| `secret`         | `` `whsec_${string}` ``                           | —         | Stripe webhook signing secret. Required. Validated at construction. |
| `dispatcher`     | `SealedDispatcher`                                | —         | The result of `createDispatcher()…build()`. Required. |
| `store`          | `IdempotencyStore`                                | in-memory | Pluggable de-duplication store. The default is single-process — replace before deploying. |
| `tolerance`      | `number` (seconds)                                | `300`     | Symmetric signature freshness window. Rejects both stale and future-dated timestamps. |
| `claimTtl`       | `number` (seconds)                                | `60`      | TTL of the in-flight claim. Should exceed worst-case handler runtime. |
| `commitTtl`      | `number` (seconds)                                | `604_800` | TTL of the committed marker — sized to outlive Stripe's 3-day retry window with margin. |
| `inFlightStatus` | `number`                                          | `503`     | HTTP status returned when another worker holds the claim. Set to `425` for the original behaviour. |
| `onDuplicate`    | `(eventId: string) => void`                       | —         | Called when an event is skipped because it was already committed. |
| `onInFlight`     | `(eventId: string) => void`                       | —         | Called when an event arrives while another worker is mid-flight on the same id. |
| `onError`        | `(error: unknown, event: Stripe.Event) => void`   | —         | Called for unexpected handler errors. The library still returns 5xx so Stripe retries. |
| `logger`         | `{ warn(msg, ctx?); error(msg, ctx?) }`           | —         | Optional structured logger (Pino, Winston, console-shimmed). Only `warn`/`error` are called. |

### Idempotency semantics

The protocol is two-phase: `claim → run → commit`, with `release` on retryable
failure.

| Outcome                 | HTTP status        | Stripe behaviour                |
|-------------------------|--------------------|---------------------------------|
| `claimed` + commit ok   | `200`              | Stops retrying.                  |
| `committed` (duplicate) | `200`              | Stops retrying.                  |
| `in-flight`             | `503` (default)    | Retries shortly.                 |
| handler throws          | `500`              | Retries with backoff.            |

This is **de-duplicated, at-least-once** — exactly-once across an HTTP boundary is
impossible without coordination the host app must own (transactional outbox). Handlers
must be internally idempotent. The bounded double-execution window equals
`claimTtlSeconds` — if a worker dies after running the handler but before committing,
the next retry runs the handler again once the claim expires.

The 0.1.x protocol does not yet carry a fencing token; if a worker's `claimTtl`
expires while the handler is still running, a second worker can steal the claim, and a
later `release` from the first worker may delete the new owner's marker. Bound the
window by setting `claimTtlSeconds` ≥ p99 handler runtime. A future minor will add
explicit fencing.

## TypeScript features

- **Strict TypeScript** — `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` all on.
- **Branded webhook secret** — `WebhookSecret = `whsec_${string}`` makes passing a
  publishable (`pk_…`) or restricted (`rk_…`) key a compile error.
- **Narrowed event payloads** — `dispatcher.on('customer.subscription.updated', …)`
  gives you `event.data.object: Stripe.Subscription` with no manual cast.
- **Const-inferred plans** — `definePlans({ … } as const)` flows literal types into
  `PlanNameOf<P>`, `PriceIdOf<P>`, `FeatureOf<P>` without manual generics.
- **Phantom registration tracking** — the dispatcher's type parameter accumulates
  registered events; re-registering the same event is a compile error.
- **Discriminated `Result<T, E>`** — expected control flow (signature mismatch,
  invalid transition, unknown plan) is `Result`-shaped, not `try/catch`.
- **Closed `ErrorCode` literal union** — `switch (err.code) { … }` narrows
  exhaustively.
- **Subpath types** — every subpath ships its own `.d.ts` and is listed in
  `typesVersions` so editors resolve types without `paths` config.

## Comparison vs alternatives

| Library | Stars | Weekly DLs | TS-first | Edge-Runtime | State machine | Plan→feature | Idempotency | Framework adapters |
|---|---:|---:|:-:|:-:|:-:|:-:|:-:|:-:|
| `stripe` (official) | 4.4 K | 9.3 M | ✓ (events) | ✗ (~400 KB, Node-crypto) | ✗ | ✗ | ✗ | ✗ |
| `use-stripe-subscription` | 320 | 850 | partial | ✗ | partial | ✗ | ✗ | React only |
| `@layeredapps/stripe-subscriptions` | 45 | 120 | ✗ | ✗ | ✓ | partial | ✗ | own framework |
| `stripe-event-types` | 280 | 10 K | types only | n/a | ✗ | ✗ | ✗ | ✗ |
| `@tsed/stripe` | 2.9 K | 320 | ✓ | ✗ | ✗ | ✗ | ✗ | Ts.ED only |
| **`@paysuite/stripe-subscriptions`** | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | Next, Hono, Fastify, Express, SvelteKit, Nitro |

The official `stripe` SDK remains the canonical low-level client — this library uses
it as a peer dependency for types. `@paysuite/stripe-subscriptions` complements it by
filling the cross-runtime, idempotency, plan-mapping and adapter gaps that every team
otherwise rebuilds by hand. For end-to-end SaaS boilerplates with UI scaffolding
(ShipFast, Supastarter, Makerkit) the trade-off is different — those bundle a whole
project structure for a one-time licence fee; this library drops into whatever stack
you already run, and stays a library.

## Examples

Three runnable examples live under [`examples/`](./examples). Each one is fully
self-contained — payloads are synthesized and signed with the library's own testing
utilities, so no Stripe account or `stripe listen` is required.

| Example | What it shows | Run | StackBlitz |
|---|---|---|---|
| [`basic-usage.ts`](./examples/basic-usage.ts) | Minimum end-to-end webhook flow: typed dispatcher + `createWebhookHandler` + signed delivery + replay → dedupe. | `npx tsx examples/basic-usage.ts` | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/basic-usage) |
| [`advanced-usage.ts`](./examples/advanced-usage.ts) | Production-shaped pipeline: `definePlans` + reducer + transition router + `withIdempotency` + structured `PaySuiteError` handling. | `npx tsx examples/advanced-usage.ts` | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/advanced-usage) |
| [`with-hono.ts`](./examples/with-hono.ts) | `createHonoMiddleware` on a Hono route, exercised via `app.fetch(Request)` with a `createSpyStore` to verify the claim/commit call log. | `npx tsx examples/with-hono.ts` | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/with-hono) |

The `examples/sandbox/` directory contains a self-contained npm package per example,
suitable for opening directly in [StackBlitz](https://stackblitz.com) — useful when
you want to fork an example into a new project without cloning the whole repo.

## Compatibility

- **Node.js** 18+
- **Bun** 1.0+
- **Deno** 1.40+
- **Edge Runtime** (Vercel, Next.js)
- **Cloudflare Workers**
- **Stripe** `>=15.0.0` (peer)
- **TypeScript** 5.4+

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
pnpm install
pnpm test         # unit tests
pnpm typecheck    # strict TS check
pnpm lint         # biome
pnpm build        # tsup
pnpm attw         # are-the-types-wrong
pnpm publint
```

Coverage threshold for `src/**` is 90 % statements / 85 % branches; please add tests
alongside changes. Use [Changesets](https://github.com/changesets/changesets) for
version-bump proposals (`pnpm changeset`).

## License

[MIT](./LICENSE) © Vasyl Bruhanda
