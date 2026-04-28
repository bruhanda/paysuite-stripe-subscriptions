/**
 * Hono adapter — drop the webhook handler onto a route in three lines.
 *
 * Demonstrates:
 *   - createHonoMiddleware mounted on an app.post route.
 *   - End-to-end signed delivery via Hono's `app.fetch(Request)` — no real
 *     HTTP server is required, which makes it equivalent to how Bun, Deno,
 *     Edge Runtime and Cloudflare Workers route requests in production.
 *   - A spy idempotency store that proves claim → commit fired exactly once.
 *
 * Run:
 *   npx tsx examples/with-hono.ts
 */
import { Hono } from 'hono';

import { createHonoMiddleware } from '@paysuite/stripe-subscriptions/adapters/hono';
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import {
  buildEvent,
  buildSubscription,
  createSpyStore,
  signPayload,
} from '@paysuite/stripe-subscriptions/testing';

const SECRET = 'whsec_example_with_hono' as const;

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (event) => {
    const sub = event.data.object;
    console.log(`[handler] sub ${sub.id} → ${sub.status}`);
  })
  .on('invoice.payment_failed', async (event) => {
    console.log(`[handler] invoice ${event.data.object.id} failed`);
  })
  .build();

const store = createSpyStore();

const app = new Hono();

app.get('/health', (c) => c.text('ok'));

app.post(
  '/stripe/webhooks',
  createHonoMiddleware({
    secret: SECRET,
    dispatcher,
    store,
    onDuplicate: (id) => console.log(`[dedupe] ${id} replayed → 200`),
  }),
);

async function deliver(eventId: string): Promise<Response> {
  const event = buildEvent(
    'customer.subscription.updated',
    buildSubscription({ id: 'sub_hono_demo', status: 'active' }),
    { id: eventId },
  );
  const body = JSON.stringify(event);
  const header = await signPayload({ secret: SECRET, payload: body });
  return app.fetch(
    new Request('http://localhost/stripe/webhooks', {
      method: 'POST',
      headers: { 'stripe-signature': header, 'content-type': 'application/json' },
      body,
    }),
  );
}

async function main(): Promise<void> {
  console.log('--- health probe (does NOT touch the webhook handler) ---');
  const health = await app.fetch(new Request('http://localhost/health'));
  console.log(`GET /health → ${health.status} ${await health.text()}`);

  console.log('\n--- first delivery (claim → run → commit) ---');
  const first = await deliver('evt_hono_1');
  console.log(`POST /stripe/webhooks → ${first.status} ${await first.text()}`);

  console.log('\n--- replay (commit hit → 200, handler skipped) ---');
  const replay = await deliver('evt_hono_1');
  console.log(`POST /stripe/webhooks → ${replay.status} ${await replay.text()}`);

  console.log('\n--- bad signature → 400 ---');
  const tampered = await app.fetch(
    new Request('http://localhost/stripe/webhooks', {
      method: 'POST',
      headers: { 'stripe-signature': 't=0,v1=deadbeef', 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  console.log(`POST /stripe/webhooks → ${tampered.status} ${await tampered.text()}`);

  console.log('\n--- idempotency store call log ---');
  for (const call of store.calls) {
    console.log(`  ${call.method.padEnd(7)} ${call.key}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
