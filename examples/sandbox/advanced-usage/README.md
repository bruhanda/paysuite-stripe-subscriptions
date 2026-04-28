# Advanced usage — `@paysuite/stripe-subscriptions`

Production-shaped subscription pipeline: typed plan→feature mapping, the event-sourced
reducer, the state-machine guard and transition router, idempotency, and structured
error handling — all wired together against an in-memory store.

## Open in StackBlitz

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/advanced-usage)

## Run locally

```bash
npm install
npm start
```

## What this demonstrates

- `definePlans({ ... } as const)` with literal-typed feature inference (`FeatureOf<P>`)
- `resolveFeatures` / `isFeatureEnabled` / `hasFeature` (tolerant vs. asserting checks)
- `reduceSubscription` projecting Stripe events to a flat persistence shape
- `validateSubscriptionTransition` returning `Result<…, InvalidTransitionError>`
- `createTransitionRouter` firing typed side-effects per `(from, to)` pair
- `withIdempotency` skipping a replayed event (`{ ran: false, reason: 'duplicate' }`)
- `PaySuiteError.toJSON()` for log sinks, with stable `err.code` discrimination
