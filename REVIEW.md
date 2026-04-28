# Response to PR #1 review (Mykhailo Kryvytskyi)

Below: every reviewer point from the latest review, what changed (or why it
didn't), and the file(s) involved. Verdict was REQUEST_CHANGES; this commit
addresses every point. Tests are out of scope for this round per the
engagement plan — they land in the next phase, which is why the §11 ≥90 %
coverage gate is not yet wired up.

`tsc --noEmit` is clean after the changes.

---

## Major

### 1. Missing build/test/lint configs and tests

- **Concern.** `package.json` references `tsup`, `vitest`, and
  `biome check` but the configs (and tests) didn't ship.
- **Status.** Partially agreed.
  - `tsup.config.ts` and `vitest.config.ts` are already in the repo at the
    root (committed before this round); the reviewer's listing missed
    them.
  - Only `biome.json` was missing.
- **Files changed.** `biome.json` (new).
- **Fix.** Added a Biome config matching the repo's style — single quotes,
  2-space indent, 100-col, trailing commas, ESM-friendly rules — so
  `pnpm lint` / `pnpm format` work without surprises. `dist`, `node_modules`,
  and `coverage` are ignored.
- **Tests deferred.** Per engagement scope, unit tests for `verifier.ts`,
  `headers.ts`, `idempotency/store.ts`, and `state-machine/transitions.ts` —
  plus the `@edge-runtime/vm` smoke suite — are the next phase. Not written
  in this PR.

### 2. Adapter export names diverge from PLAN

- **Concern.** Reviewer cited `createHonoHandler` /
  `createFastifyHandler` and flagged SvelteKit / Nitro as missing from PLAN
  §2.8.
- **Status.** Partially disagreed on the first half, agreed on the second.
  - Source already exports `createHonoMiddleware`
    (`src/adapters/hono/index.ts:35`) and `createFastifyPlugin`
    (`src/adapters/fastify/index.ts:55`), matching PLAN §2.8 verbatim. No
    rename needed; the review citation appears stale.
  - SvelteKit / Nitro factories live under `src/adapters/{sveltekit,nitro}/`
    and in `package.json` exports but were not in PLAN §2.8.
- **Files changed.** `PLAN.md` (§2.8 amended to add `createSveltekitHandler`
  and `createNitroHandler`) so doc and code agree before publish.

### 3. `extractPriceId` returns `''` for empty `items.data`

- **Concern.** Empty string flows into `SubscriptionState.priceId`, then
  into `resolveFeatures(plans, '')` — `null` answer collapses "malformed
  input" into "unknown plan" at every downstream feature lookup.
- **Files changed.** `src/state-machine/reducer.ts`.
- **Fix.** Widened `SubscriptionState.priceId` to `string | null` (with a
  JSDoc note explaining why) and made `extractPriceId` return `null` for
  empty `items.data`. Callers narrow before passing to `resolveFeatures` —
  the malformed-input case is no longer silently coerced into a false
  "unknown plan" answer.

### 4. `current_period_start` / `current_period_end` moved off `Subscription` in API `2025-03-31.basil`

- **Concern.** Reading top-level fields breaks against newer Stripe SDK
  majors that move them onto subscription items.
- **Files changed.** `src/state-machine/reducer.ts`.
- **Fix.** Added an `extractPeriods(sub)` helper that prefers
  `sub.items.data[0].current_period_*` (basil and later) and falls back to
  the top-level fields (legacy versions). Casts on both sides widen the
  relevant fields to `optional`, so the code compiles under the v15 peer
  range we ship today *and* against newer majors when callers upgrade. No
  peer-range pin — the reducer stays compatible with both.

### 5. Root barrel re-exports `PaySuiteError` as a value

- **Concern.** Drags the full error-class graph into every consumer of the
  root entry, contradicting PLAN §2.1 ("types only") and §6.1 (~0.3 KB
  root budget).
- **Files changed.** `src/index.ts`.
- **Fix.** Changed to `export type { PaySuiteError, ErrorCode }`. Value
  imports (constructor / `instanceof`) now go through
  `@paysuite/stripe-subscriptions/errors`, which is the documented path in
  PLAN §2.7. JSDoc on the barrel calls out the value-import subpath
  explicitly so consumers grep-find it.

---

## Medium

### 6. `release` has no fencing token

- **Concern.** A slow worker whose claim TTL has expired can have its
  late-arriving `release()` delete the *new* owner's claim row, dropping
  in-flight protection until the new owner commits.
- **Status.** Agreed in spirit; took the reviewer's option (b) for 0.1.x —
  explicit documentation — and deferred fencing tokens to a follow-up
  minor. Adding tokens cleanly requires changing the `IdempotencyStore`
  interface (`claim` returns a token; `commit` / `release` consume one),
  which is a bigger surface change than the engagement scope and would
  have rippled into every storage adapter. Documenting the hazard now
  with a clear mitigation (`claimTtlSeconds ≥ p99 handler runtime`) gives
  consumers what they need until the breaking change can land in 0.2.
- **Files changed.** `src/idempotency/store.ts` — added a "Stolen-claim
  hazard" callout to `IdempotencyStore.release` JSDoc, naming the failure
  mode and the mitigation, and pointing at the planned 0.2 fencing-token
  change.

### 7. SQL identifier interpolation in postgres adapter

- **Concern.** `${table}` is interpolated into every SQL statement without
  validation. Library-developer config today, but a one-line guard at
  construction time removes the footgun for any future code path that
  wires the table name from env.
- **Files changed.** `src/storage/postgres/index.ts`.
- **Fix.** Added a strict
  `IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/` check at
  `createPostgresStore` construction time. Throws `ConfigError`
  (`CONFIG_INVALID`) with the offending value on mismatch. Library
  default (`paysuite_idempotency`) trivially passes.

### 8. `signPayload` lacks `now?: () => number`

- **Concern.** `verifyStripeSignature` accepts a `now` clock override but
  `signPayload` did not, forcing tests that need both sides on a fixed
  clock to mock globals or hard-pin a `timestamp` — defeating the §0 #2
  "deterministic tests without `vi.useFakeTimers`" principle.
- **Files changed.** `src/testing/signing.ts`.
- **Fix.** Added an optional `now?: () => number` to `signPayload` opts.
  Resolution order: explicit `timestamp` wins; otherwise `now()` (epoch
  ms, same units as `Date.now`) is consulted; otherwise `Date.now`. Tests
  can now share one fake clock across signing and verification.

### 9. Verifier hot path skipped `parseEvent`'s shape check

- **Concern.** `verifier.ts` did its own `JSON.parse` and cast straight to
  `Stripe.Event` — a payload that passed HMAC but was structurally not
  an event (`{}`, an array, ...) reached user handlers as a
  typed-but-malformed object.
- **Files changed.** `src/webhooks/verifier.ts`.
- **Fix.** Replaced the inline `JSON.parse` with a call to `parseEvent`
  from `parser.ts`, mapping its `PaySuiteError` failure into a
  `SignatureVerificationError(MALFORMED_PAYLOAD)`. All entry points now
  share the same shape check — downstream reducers no longer crash on
  `Cannot read properties of null` for malformed-but-signed payloads.

### 10. `loadFixture` stub throws unconditionally

- **Concern.** Reviewer cited a `loadFixture` that exists as a public,
  always-throws stub.
- **Status.** Already resolved at the time of review — `loadFixture` is
  *not* exported from `src/testing/fixtures/index.ts`. The file exports
  only the `FixtureName` and `FixtureOf<N>` types and carries a comment
  explaining that the bundled fixture corpus and a `loadFixture` loader
  land in a follow-up release. No code change required for this point.

---

## Minor

### 11. In-memory store has no periodic sweep

- **Concern.** `purgeIfExpired` only runs on the key being inspected;
  long-lived dev servers accumulate keys indefinitely.
- **Status.** Already addressed in the source at the time of review.
  `createMemoryStore` accepts an optional `maxKeys` (default `10_000`)
  and a `sweepAndEvict` pass purges expired entries first, then evicts
  the oldest *committed* entries (preserving in-flight `claimed` rows)
  to stay under the cap. The dev-only positioning is also called out in
  the JSDoc. No further code change needed.

### 12. `active → trialing` transition is unrealistic

- **Concern.** Stripe doesn't roll a paid subscription back into
  `trialing`; allowing it widens the table enough to mask legitimate
  caller bugs.
- **Files changed.** `src/state-machine/transitions.ts`.
- **Fix.** Removed `'trialing'` from the `active` allowed list. The
  remaining `paused → trialing` transition stays — resumed-with-trial is
  a documented Stripe scenario.

### 13. Redundant `Number.isFinite` in headers parser

- **Concern.** `if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0)`
  is redundant; `Number.isInteger` already returns `false` for `NaN` and
  `±Infinity`.
- **Files changed.** `src/webhooks/headers.ts`.
- **Fix.** Dropped the `!Number.isFinite(n)` clause; left a one-line
  comment naming the equivalence so a future reader doesn't reintroduce
  it.

### 14. `onAny` serial-execution contract was undocumented

- **Concern.** Several `onAny` handlers stack their latency unnecessarily;
  consumers shouldn't bake ordering assumptions into something the
  contract doesn't guarantee.
- **Status.** Agreed on the documentation half; declined to switch to
  `Promise.all`. Reasoning: sequential execution is a deliberate property
  — it preserves causal ordering across `log → metric → side-channel`
  chains and lets later handlers depend on earlier ones. Switching to
  `Promise.all` would silently break any consumer that relied on that
  ordering, even though we never explicitly promised it. Better to
  document the guarantee than to retract it.
- **Files changed.** `src/events/dispatcher.ts`.
- **Fix.** Documented the strict-sequential contract on
  `EventDispatcher.onAny`, including the recommendation to fan out with
  `Promise.all` *inside* a single `onAny` for parallel-friendly telemetry.

---

## What was NOT changed (and why)

- **Test suite, build/lint of test runs.** Out of engagement scope this
  round; will be the next phase. Configs (`tsup.config.ts`,
  `vitest.config.ts`, `biome.json`) all in place so the next phase is a
  drop-in.
- **Full fencing-token implementation for `release`.** Deferred to 0.2
  because it is a breaking change to `IdempotencyStore` (claim returns a
  token; commit/release accept one). 0.1.x ships with the documented
  hazard plus the `claimTtlSeconds ≥ p99 handler runtime` mitigation.
- **`onAny` parallel execution.** Declined; sequential execution is a
  deliberate causal-ordering guarantee, now made explicit in the JSDoc.
