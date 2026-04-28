import { describe, expect, it } from 'vitest';
import {
  type FastifyReplyLike,
  type FastifyRequestLike,
  createFastifyPlugin,
} from '../adapters/fastify/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_fastify' as WebhookSecret;

const buildReply = () => {
  let status = 0;
  const headers: Record<string, string> = {};
  let bodyOut: string | Uint8Array | undefined;
  const reply: FastifyReplyLike = {
    code(s: number) {
      status = s;
      return reply;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return reply;
    },
    send(b: string | Uint8Array) {
      bodyOut = b;
    },
  };
  return {
    reply,
    get status() {
      return status;
    },
    headers,
    get body() {
      return bodyOut;
    },
  };
};

describe('adapters/fastify/createFastifyPlugin', () => {
  it('should accept Uint8Array body and return 200 when signature is valid', async () => {
    const body = JSON.stringify({
      id: 'evt_f',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });

    const plugin = createFastifyPlugin({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: FastifyRequestLike = {
      headers: { 'stripe-signature': header },
      url: '/wh',
      body: new TextEncoder().encode(body),
    };
    const out = buildReply();
    await plugin(req, out.reply);
    expect(out.status).toBe(200);
  });

  it('should accept a string body and return 200 when signature is valid', async () => {
    const body = JSON.stringify({
      id: 'evt_f2',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });

    const plugin = createFastifyPlugin({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: FastifyRequestLike = {
      headers: { 'stripe-signature': header },
      url: '/wh',
      body,
    };
    const out = buildReply();
    await plugin(req, out.reply);
    expect(out.status).toBe(200);
  });

  it('should default to an empty body when req.body is undefined and return 400', async () => {
    const plugin = createFastifyPlugin({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: FastifyRequestLike = {
      headers: { 'stripe-signature': 't=1,v1=' + 'a'.repeat(64) },
      url: '/wh',
      body: undefined,
    };
    const out = buildReply();
    await plugin(req, out.reply);
    // Empty payload → 400 from verifier.
    expect(out.status).toBe(400);
  });

  it('should join array-valued headers with comma when constructing the request', async () => {
    const body = JSON.stringify({
      id: 'evt_arr',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const plugin = createFastifyPlugin({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: FastifyRequestLike = {
      headers: {
        'stripe-signature': [header],
        'x-multi': ['a', 'b'],
      },
      url: '/wh',
      body,
    };
    const out = buildReply();
    await plugin(req, out.reply);
    // Array signature joined with comma — first segment is the real header.
    expect(out.status).toBe(200);
  });

  it('should set the response content-type from the Web response when sending', async () => {
    const plugin = createFastifyPlugin({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: FastifyRequestLike = {
      headers: {},
      url: '/wh',
      body: undefined,
    };
    const out = buildReply();
    await plugin(req, out.reply);
    expect(out.status).toBe(400);
    expect(out.headers['content-type']).toMatch(/text\/plain/);
  });
});
