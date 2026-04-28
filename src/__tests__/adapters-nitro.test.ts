import { describe, expect, it } from 'vitest';
import { createNitroHandler } from '../adapters/nitro/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_nitro' as WebhookSecret;

describe('adapters/nitro/createNitroHandler', () => {
  it('should accept a Web Request and return 200 when signature is valid', async () => {
    const body = JSON.stringify({
      id: 'evt_n',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const handler = createNitroHandler({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const request = new Request('http://localhost/wh', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body,
    });
    const response = await handler(request);
    expect(response.status).toBe(200);
  });

  it('should return 400 when stripe-signature header is missing', async () => {
    const handler = createNitroHandler({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const request = new Request('http://localhost/wh', { method: 'POST', body: 'x' });
    const response = await handler(request);
    expect(response.status).toBe(400);
  });
});
