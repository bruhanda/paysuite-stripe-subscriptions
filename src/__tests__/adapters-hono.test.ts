import { describe, expect, it } from 'vitest';
import { createHonoMiddleware } from '../adapters/hono/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_hono' as WebhookSecret;

describe('adapters/hono/createHonoMiddleware', () => {
  it('should return a function accepting a Hono context with c.req.raw when called', () => {
    const middleware = createHonoMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    expect(typeof middleware).toBe('function');
  });

  it('should pass c.req.raw through to the underlying webhook handler when invoked', async () => {
    const body = JSON.stringify({
      id: 'evt_hono',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const seen: string[] = [];
    const middleware = createHonoMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher()
        .on('invoice.paid', (e) => {
          seen.push(e.id);
        })
        .build(),
    });
    const raw = new Request('http://localhost/wh', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body,
    });
    const response = await middleware({ req: { raw } });
    expect(response.status).toBe(200);
    expect(seen).toEqual(['evt_hono']);
  });

  it('should return 400 when the request has no stripe-signature header', async () => {
    const middleware = createHonoMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const raw = new Request('http://localhost/wh', { method: 'POST', body: 'x' });
    const response = await middleware({ req: { raw } });
    expect(response.status).toBe(400);
  });
});
