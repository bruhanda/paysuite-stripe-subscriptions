# Response to Code Review by Mykhailo Kryvytskyi

Below: every reviewer point, what changed (or why it didn't), and the file(s)
involved. Verdict was REQUEST_CHANGES; this commit addresses every point.
Tests are intentionally untouched in this round — they are the next phase.

---

## Major

### 1. Hono / Fastify adapter export names diverged from PLAN §2.8 — **fixed**

- **Concern.** Public exports were `createHonoHandler` /
  `createFastifyHandler`, but PLAN §2.8 (and README-bound docs) promise
  `createHonoMiddleware` / `createFastifyPlugin`. Renaming after 0.1.0 is
  breaking; reviewer preferred the rename so the Fastify slot can later be
  promoted to a real `FastifyPluginCallback` without another break.
- **Files.** `src/adapters/hono/index.ts`, `src/adapters/fastify/index.ts`.
- **Change.** Renamed exports to `createHonoMiddleware` and
  `createFastifyPlugin`. JSDoc for `createFastifyPlugin` now states
  explicitly that the 0.1.x cut returns a route handler and that the slot
  is reserved for a future `FastifyPluginCallback` shape — so the type
  promotion is not blocked on an export rename.

### 2. Shared `SUBSCRIPTION_DEFAULTS` reference leaked across `buildSubscription` calls — **fixed**

- **Concern.** `SUBSCRIPTION_DEFAULTS` was a module-level `const`, so
  `metadata: {}` (and any future nested object) was the same reference for
  every returned subscription. A test mutating `sub.metadata.tenantId =
  'x'` would corrupt every subsequent `buildSubscription()` in the same
  process and produce flaky cross-test failures.
- **Files.** `src/testing/factories.ts`.
- **Change.** Replaced the shared `const` with a
  `buildSubscriptionDefaults()` factory. Each call now returns brand-new
  nested objects, so test mutation cannot leak. Took the factory route
  rather than `Object.freeze` to keep the existing override-merge ergonomics
  (frozen objects would surprise tests that splat-spread the result).

### 3. `loadFixture` exported a stub that always throws — **fixed**

- **Concern.** Function was exported, declared as a separate subpath in
  `package.json`, and its only behaviour in 0.1.0 was to throw — anyone
  discovering it via autocomplete would land on a dead surface.
- **Files.** `src/testing/fixtures/index.ts`.
- **Change.** Removed the `loadFixture` export entirely; kept the
  `FixtureName` / `FixtureOf` types so consumers can wire their own loader
  against the same keys the eventual `loadFixture` will use. The
  `package.json` `./testing/fixtures` subpath stays so the type re-exports
  remain accessible — anyone importing that path now gets *types only*,
  which `attw` will not flag as a broken function. Shipping a real fixture
  is deferred to the follow-up release, as already noted in PLAN §2.11.

### 4. `commit()` was self-healing across all stores — **fixed**

- **Concern.** Postgres `commit` was `INSERT … ON CONFLICT DO UPDATE`,
  which writes a `committed` row even when no prior `claimed` row existed.
  Redis and the in-memory store had analogous "set unconditionally"
  behaviour. The two-phase protocol requires a successful `claim` first;
  self-healing masks bugs in `withIdempotency` (or any hand-written
  caller) and lets a missed claim silently poison the dedupe table.
- **Files.** `src/storage/postgres/index.ts`,
  `src/storage/redis/index.ts`, `src/idempotency/store.ts`.
- **Change.**
  - Postgres: `commit` is now `UPDATE … WHERE key = $1 AND status =
    'claimed'`; if `rowCount !== 1` we throw `StoreError` with
    `STORE_UNAVAILABLE` and a `details.key` payload.
  - Redis: `commit` first `GET`s the key; if it isn't `'claimed'` we
    throw `StoreError`. Then `SET key 'committed' EX ttl`. Note that the
    minimal `RedisLike` shape (no `EVAL` for Lua) makes a strictly atomic
    CAS impossible — this is materially stronger than self-healing without
    growing the peer-dep surface; a Lua `SET-IF-EQ` upgrade is on the
    backlog for the storage README.
  - Memory: same shape — `existing.state !== 'claimed'` raises
    `StoreError`. Errors module imports added at module top-level, so no
    tree-shaking impact.
  - Durable Objects: not modified — the reference DO body is documented
    only as JSDoc and the protocol there is already write-through; users
    who copy the example may want to harden it themselves once they wire
    in real persistence.

### 5. `isStripeEventShape` accepted any `data.object` shape — **fixed**

- **Concern.** The original guard accepted `data.object` of any value
  type (`number`, `null`, array, string), then cast to `Stripe.Event`.
  The reducer at `src/state-machine/reducer.ts:62` then reads `.id`,
  `.customer`, `.items.data[0]` — a malformed-but-signed payload (or a
  hand-rolled fixture) would crash with `Cannot read properties of null`
  instead of returning a structured `MALFORMED_PAYLOAD`. The verifier's
  inline `JSON.parse` path skipped structural validation entirely.
- **Files.** `src/webhooks/parser.ts`, `src/webhooks/verifier.ts`.
- **Change.** Tightened `isStripeEventShape` to require `data.object` be
  a non-null, non-array object. The verifier no longer carries its own
  inline `JSON.parse` — after a successful HMAC it routes the bytes
  through `parseEvent`, so the structural validation runs in exactly one
  place and any future tightening lands in both code paths automatically.

### 6. `now?: () => number` unit was undocumented — **fixed**

- **Concern.** `verifier.ts:130-152` documents `now` as "Defaults to
  `Date.now`" but the type doesn't carry the unit. A caller passing
  `() => Math.floor(Date.now() / 1000)` (a natural mistake given Stripe
  timestamps are unix-seconds) silently fails the tolerance check on
  every event.
- **Files.** `src/webhooks/verifier.ts`.
- **Change.** Both `VerifyOptions.now` and the matching field on
  `verifyStripeSignatureFromText` now carry an explicit JSDoc note: the
  callback must return **epoch milliseconds**, same units as
  `Date.now()`, with the seconds-mistake called out by name. Did not
  rename to `nowMs` — every caller in the public API surface uses `now`
  and a rename ripples into the user-facing `WebhookHandlerOptions`,
  storage adapters, and the testing helpers; the JSDoc fix is the
  cheapest way to close the unit ambiguity without a breaking rename.

### 7. `425 Too Early` for `'in-flight'` — **fixed (made configurable, default changed)**

- **Concern.** `425 Too Early` is a TLS-replay-protection code; `503` is
  closer in spirit and aligns with PLAN §2.6's "5xx" mapping. Reviewer
  asked for at minimum a config option since infra teams sometimes alert
  on specific 5xx ranges.
- **Files.** `src/webhooks/handler.ts`.
- **Change.** Added `WebhookHandlerOptions.inFlightStatus?: number`,
  defaulting to `503`. JSDoc explains both the rationale and the
  `425`-restoration override.

### 8. Dead `String()` calls in `plans/resolve.ts` — **fixed**

- **Files.** `src/plans/resolve.ts`.
- **Change.** Both `String(priceId)` calls inside the `ConfigError`
  message and `details` payload removed; `priceId` is already typed
  `PriceIdOf<P>` (a `string` literal union).

### 9. Per-call `fromHex` allocation for non-64-char candidate hex — **fixed**

- **Concern.** SHA-256 MACs are 32 bytes / 64 hex chars; the verifier
  was paying full `fromHex` allocation + per-byte parse before letting
  `timingSafeEqual` reject. An attacker spamming long bogus segments in
  the header could exploit that.
- **Files.** `src/webhooks/verifier.ts`.
- **Change.** `if (candidateHex.length !== 64) continue;` short-circuit
  before `fromHex`.

### 10. Per-call `TextDecoder` instantiation — **fixed**

- **Files.** `src/webhooks/parser.ts`, `src/webhooks/verifier.ts`.
- **Change.** Hoisted a single module-level `utf8Decoder` constant in
  the parser (with `/* @__PURE__ */` annotation, matching the existing
  pattern in `core/encoding.ts`). The verifier no longer instantiates
  its own decoder — point 5's parser-routing change collapsed both call
  sites into the parser's single hoisted instance.

### 11. `onAny` not running on typed-handler error — **documented**

- **Files.** `src/events/dispatcher.ts`.
- **Change.** `EventDispatcher.onAny` JSDoc now explicitly states that
  catch-all handlers do **not** run if the typed handler throws — and
  why (the wrapping idempotency guard needs to see the throw to call
  `release` and let Stripe retry). Behaviour itself is unchanged: this
  is the documented contract from PLAN §2.3, the reviewer's ask was a
  one-line clarification on the `onAny` doc.

### 12. Reducer same-second tie-breaking — **documented**

- **Concern.** `event.created < prev.updatedAt` drops any event whose
  `created` is strictly less than the high-water mark — which means two
  events emitted in the same Stripe-second land in either-order, and
  the second one (with identical `created`) overwrites the first.
- **Files.** `src/state-machine/reducer.ts`.
- **Change.** Kept the `<` comparator (intentional — see below) and
  added a JSDoc paragraph naming the trade. **Why we kept `<` rather
  than tightening to `<=`:** Stripe's `event.created` has 1-second
  resolution. If we used `<=`, the *second* of two same-second events
  would be dropped — which means every same-second pair silently loses
  information. With `<`, the second event applies (overwriting the
  first); this trades rare duplicate application for never-skipping a
  real update, which is the right side to err on for an event-sourced
  reducer whose handlers are documented as internally idempotent.
  Persistence layers needing strict monotonicity should compare on a
  server-provided sequence number, which is now called out in the
  JSDoc.

### 13. In-memory map can grow unboundedly under adversarial input — **fixed**

- **Concern.** `purgeIfExpired` only fires on `claim`. A long-lived
  process could accumulate expired keys without ever calling `claim`
  for them. Not correctness (TTL is enforced on read), but the Map
  grows without bound.
- **Files.** `src/idempotency/store.ts`.
- **Change.** Added a soft `maxKeys` cap (default `10_000`, tunable via
  `createMemoryStore({ maxKeys })`). When `claim` would push the map
  to `maxKeys`, `sweepAndEvict()` first deletes every TTL-expired
  entry and, if still over the cap, evicts the oldest *committed*
  entries in insertion order — never a live `claimed` row, so an
  in-flight handler is never undermined by the sweep. The dev-only
  posture of this store is retained; production users still need
  Redis/Postgres/DurableObjects.

---

## What was NOT changed

Nothing was declined. Every reviewer point led to a code change or, where
the existing behaviour was already correct, an explicit doc clarification
(points 11 and 12).

Two places where the response went slightly beyond the literal ask:

- **Point 5.** Rather than only tightening the parser guard, I also routed
  the verifier's post-HMAC `JSON.parse` through `parseEvent`. The single
  validation site means future tightening can't accidentally apply to one
  path and not the other.
- **Point 12.** Reviewer offered "use `<=` or document the boundary" as
  alternatives. I documented the boundary instead of switching the
  comparator, and the JSDoc names the rationale so a future maintainer
  doesn't quietly flip it without realising what gets dropped.

Tests are deliberately not touched in this round; they are the next
phase. Type-check (`tsc --noEmit`) is clean.

---

## Adjacent hardening landed this round

`src/storage/postgres/index.ts` also gained a strict identifier guard on
the configurable `table` option (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`, throws
`ConfigError(CONFIG_INVALID)` at store-construction time). The `table`
name is interpolated directly into SQL (it cannot be parameterised), so
the regex is the only barrier between caller config and statement
injection. Not a reviewer point, but it fits naturally with the
two-phase tightening since both touch the Postgres adapter's input
validation surface.

