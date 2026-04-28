# Basic usage — `@paysuite/stripe-subscriptions`

Minimum end-to-end webhook flow. Builds a typed dispatcher, composes the cross-runtime
webhook handler, and drives it with a self-signed payload using the library's testing
utilities — no real Stripe account or `stripe listen` required.

## Open in StackBlitz

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/basic-usage)

## Run locally

```bash
npm install
npm start
```

You should see:

```
--- first delivery ---
[handler] subscription sub_basic_demo is now active
[trace] saw customer.subscription.updated (evt_basic_demo)
response: 200 OK

--- replay (idempotency kicks in) ---
[dedupe] skipped duplicate evt_basic_demo
response: 200 Duplicate event — already committed.
```

## What this demonstrates

- `createDispatcher` with a typed `customer.subscription.updated` handler
- `onAny` for a catch-all telemetry hook
- `createWebhookHandler` composing signature verification, idempotency, and dispatch
- `signPayload` + `buildEvent` + `buildSubscription` for self-signed test deliveries
- The `onDuplicate` hook firing on replay
