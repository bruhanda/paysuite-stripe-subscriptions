/**
 * Basic usage — minimum end-to-end webhook flow.
 *
 *   1. Build a typed dispatcher with one handler per event.
 *   2. Compose a webhook handler that verifies signatures and de-duplicates.
 *   3. Sign a payload with the testing utility (no Stripe CLI required).
 *   4. Drive the handler with a synthetic Request and inspect the Response.
 */
import { createDispatcher } from '@paysuite/stripe-subscriptions/events';
import { buildEvent, buildSubscription, signPayload } from '@paysuite/stripe-subscriptions/testing';
import { createWebhookHandler } from '@paysuite/stripe-subscriptions/webhooks';

const SECRET = 'whsec_example_basic_usage' as const;

const dispatcher = createDispatcher()
  .on('customer.subscription.updated', async (event) => {
    const sub = event.data.object;
    console.log(`[handler] subscription ${sub.id} is now ${sub.status}`);
  })
  .onAny((event) => {
    console.log(`[trace] saw ${event.type} (${event.id})`);
  })
  .build();

const handler = createWebhookHandler({
  secret: SECRET,
  dispatcher,
  onDuplicate: (id) => console.log(`[dedupe] skipped duplicate ${id}`),
});

async function fireWebhook(): Promise<Response> {
  const event = buildEvent(
    'customer.subscription.updated',
    buildSubscription({ id: 'sub_basic_demo', status: 'active' }),
    { id: 'evt_basic_demo' },
  );
  const body = JSON.stringify(event);
  const header = await signPayload({ secret: SECRET, payload: body });

  return handler(
    new Request('https://example.com/stripe/webhooks', {
      method: 'POST',
      headers: { 'stripe-signature': header, 'content-type': 'application/json' },
      body,
    }),
  );
}

async function main(): Promise<void> {
  console.log('--- first delivery ---');
  const first = await fireWebhook();
  console.log(`response: ${first.status} ${await first.text()}`);

  console.log('\n--- replay (idempotency kicks in) ---');
  const replay = await fireWebhook();
  console.log(`response: ${replay.status} ${await replay.text()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
