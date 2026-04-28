# Hono adapter — `@paysuite/stripe-subscriptions`

Drop-in Hono middleware for the Stripe webhook handler. Uses `app.fetch(Request)` so
the example runs end-to-end without spawning a real HTTP server — the same code path
runs unchanged on Bun, Deno, Vercel Edge Runtime, and Cloudflare Workers.

## Open in StackBlitz

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/bruhanda/paysuite-stripe-subscriptions/tree/main/examples/sandbox/with-hono)

## Run locally

```bash
npm install
npm start
```

Expected output:

```
--- health probe (does NOT touch the webhook handler) ---
GET /health → 200 ok

--- first delivery (claim → run → commit) ---
[handler] sub sub_hono_demo → active
POST /stripe/webhooks → 200 OK

--- replay (commit hit → 200, handler skipped) ---
[dedupe] evt_hono_1 replayed → 200
POST /stripe/webhooks → 200 Duplicate event — already committed.

--- bad signature → 400 ---
POST /stripe/webhooks → 400 Stripe-Signature timestamp is older than 300s.

--- idempotency store call log ---
  claim   stripe:event:evt_hono_1
  commit  stripe:event:evt_hono_1
  claim   stripe:event:evt_hono_1
```

## What this demonstrates

- `createHonoMiddleware` wired onto an `app.post('/stripe/webhooks', …)` route
- A typed dispatcher with handlers for two distinct event types
- `createSpyStore` recording every `claim` / `commit` call for white-box assertions
- Replay → de-duplication via the documented two-phase protocol
- Tampered `Stripe-Signature` rejected with `400`, never reaching the dispatcher
