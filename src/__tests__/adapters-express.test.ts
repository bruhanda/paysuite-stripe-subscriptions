import { describe, expect, it, vi } from 'vitest';
import {
  type ExpressRequestLike,
  type ExpressResponseLike,
  createExpressMiddleware,
} from '../adapters/express/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_express' as WebhookSecret;

const buildResponse = () => {
  let statusCode = 0;
  const headers: Record<string, string> = {};
  let bodyOut: string | Uint8Array | undefined;
  const res: ExpressResponseLike = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    end(b) {
      bodyOut = b;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
  };
  return {
    res,
    get statusCode() {
      return statusCode;
    },
    headers,
    get body() {
      return bodyOut;
    },
  };
};

const fakeNodeReq = (
  body: Uint8Array,
  headersIn: Record<string, string | string[] | undefined>,
): ExpressRequestLike => {
  const listeners = {
    data: [] as Array<(c: Uint8Array) => void>,
    end: [] as Array<() => void>,
    error: [] as Array<(e: Error) => void>,
  };
  const req: ExpressRequestLike = {
    method: 'POST',
    url: '/wh',
    headers: headersIn,
    on(event: 'data' | 'end' | 'error', listener: never) {
      listeners[event].push(listener as never);
    },
  };
  queueMicrotask(() => {
    for (const l of listeners.data) l(body);
    for (const l of listeners.end) l();
  });
  return req;
};

describe('adapters/express/createExpressMiddleware', () => {
  it('should handle a Uint8Array body and return 200 when signature is valid', async () => {
    const body = JSON.stringify({
      id: 'evt_e',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const middleware = createExpressMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: ExpressRequestLike = {
      method: 'POST',
      url: '/wh',
      headers: { 'stripe-signature': header },
      on() {},
      body: new TextEncoder().encode(body),
    };
    const out = buildResponse();
    const next = vi.fn();
    await middleware(req, out.res, next);
    expect(out.statusCode).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle a string body when express.json was used (fallback)', async () => {
    const body = JSON.stringify({
      id: 'evt_str',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const middleware = createExpressMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: ExpressRequestLike = {
      method: 'POST',
      url: '/wh',
      headers: { 'stripe-signature': header },
      on() {},
      body,
    };
    const out = buildResponse();
    await middleware(req, out.res, vi.fn());
    expect(out.statusCode).toBe(200);
  });

  it('should fall back to streaming the body when req.body is absent', async () => {
    const body = JSON.stringify({
      id: 'evt_stream',
      type: 'invoice.paid',
      data: { object: { id: 'in_1' } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    const middleware = createExpressMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req = fakeNodeReq(new TextEncoder().encode(body), {
      'stripe-signature': header,
    });
    const out = buildResponse();
    await middleware(req, out.res, vi.fn());
    expect(out.statusCode).toBe(200);
  });

  it('should call next(err) when an unhandled error occurs while reading the body', async () => {
    const middleware = createExpressMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const listeners = {
      data: [] as Array<(c: Uint8Array) => void>,
      end: [] as Array<() => void>,
      error: [] as Array<(e: Error) => void>,
    };
    const req: ExpressRequestLike = {
      method: 'POST',
      url: '/wh',
      headers: { 'stripe-signature': 't=1,v1=' + 'a'.repeat(64) },
      on(event: 'data' | 'end' | 'error', listener: never) {
        listeners[event].push(listener as never);
      },
    };
    queueMicrotask(() => {
      for (const l of listeners.error) l(new Error('stream broken'));
    });
    const out = buildResponse();
    const next = vi.fn();
    await middleware(req, out.res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should propagate the response content-type when sending', async () => {
    const middleware = createExpressMiddleware({
      secret: SECRET,
      dispatcher: createDispatcher().build(),
    });
    const req: ExpressRequestLike = {
      method: 'POST',
      url: '/wh',
      headers: {},
      on() {},
      body: new Uint8Array(),
    };
    const out = buildResponse();
    await middleware(req, out.res, vi.fn());
    expect(out.statusCode).toBe(400); // missing signature
    expect(out.headers['content-type']).toMatch(/text\/plain/);
  });
});
