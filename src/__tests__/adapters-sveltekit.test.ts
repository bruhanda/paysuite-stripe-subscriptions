import { describe, expect, it } from 'vitest';
import { createSveltekitHandler } from '../adapters/sveltekit/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_sveltekit' as WebhookSecret;

describe('adapters/sveltekit/createSveltekitHandler', () => {
  it('should accept a SvelteKit RequestEvent and return 200 when signature is valid', async () => {
    const body = JSON.stringify({
      id: 'evt_sk',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const handler = createSveltekitHandler({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const request = new Request('http://localhost/wh', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body,
    });
    const response = await handler({ request });
    expect(response.status).toBe(200);
  });

  it('should return 400 when stripe-signature header is missing', async () => {
    const handler = createSveltekitHandler({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const request = new Request('http://localhost/wh', { method: 'POST', body: 'x' });
    const response = await handler({ request });
    expect(response.status).toBe(400);
  });
});
