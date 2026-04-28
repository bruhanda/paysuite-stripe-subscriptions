import { describe, expect, it } from 'vitest';
import {
  type NodeRequestLike,
  type NodeResponseLike,
} from '../adapters/_node-bridge.js';
import {
  type ExpressRequestLike,
  type ExpressResponseLike,
  createExpressMiddleware,
} from '../adapters/express/index.js';
import {
  type FastifyReplyLike,
  type FastifyRequestLike,
  createFastifyPlugin,
} from '../adapters/fastify/index.js';
import {
  type HonoContextLike,
  createHonoMiddleware,
} from '../adapters/hono/index.js';
import {
  config,
  createNextApiHandler,
  createNextRouteHandler,
} from '../adapters/next/index.js';
import { createNitroHandler } from '../adapters/nitro/index.js';
import {
  type SveltekitRequestEventLike,
  createSveltekitHandler,
} from '../adapters/sveltekit/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_test' as WebhookSecret;

const buildBody = (id = 'evt_a'): string =>
  JSON.stringify({
    id,
    type: 'invoice.paid',
    data: { object: { id: 'in_1' } },
  });

const buildSignedRequest = async (body: string): Promise<Request> => {
  const ts = Math.floor(Date.now() / 1000);
  const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
  return new Request('http://localhost/wh', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body,
  });
};

const baseOpts = () => ({
  secret: SECRET,
  dispatcher: createDispatcher().build(),
});

describe('adapters', () => {
  describe('next/app-router', () => {
    it('should expose a POST handler that returns 200 OK on a valid signed request', async () => {
      const { POST } = createNextRouteHandler(baseOpts());
      const r = await POST(await buildSignedRequest(buildBody()));
      expect(r.status).toBe(200);
    });
  });

  describe('next/pages-router', () => {
    it('should pipe a Web Response back through the Node-style res when called', async () => {
      const handler = createNextApiHandler(baseOpts());
      const ts = Math.floor(Date.now() / 1000);
      const body = buildBody();
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });

      const listeners: { data: Array<(c: Uint8Array) => void>; end: Array<() => void> } = {
        data: [],
        end: [],
      };
      const req: NodeRequestLike = {
        method: 'POST',
        url: '/api/wh',
        headers: { 'stripe-signature': header },
        on(event: 'data' | 'end' | 'error', listener: never) {
          if (event === 'data') listeners.data.push(listener as never);
          else if (event === 'end') listeners.end.push(listener as never);
        },
      };
      let responseBody: Uint8Array | string | undefined;
      let statusCode = 200;
      const res: NodeResponseLike = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(value: number) {
          statusCode = value;
        },
        setHeader() {},
        end(b) {
          responseBody = b;
        },
      };

      // Fire body bytes after handler subscribes.
      const promise = handler(req, res);
      queueMicrotask(() => {
        for (const l of listeners.data) l(new TextEncoder().encode(body));
        for (const l of listeners.end) l();
      });
      await promise;
      expect(statusCode).toBe(200);
      expect(responseBody).toBeDefined();
    });

    it('should expose the bodyParser=false config when imported', () => {
      expect(config.api.bodyParser).toBe(false);
    });
  });

  describe('hono', () => {
    it('should call the handler with c.req.raw and return its Response', async () => {
      const middleware = createHonoMiddleware(baseOpts());
      const ctx: HonoContextLike = {
        req: { raw: await buildSignedRequest(buildBody()) },
      };
      const r = await middleware(ctx);
      expect(r.status).toBe(200);
    });
  });

  describe('fastify', () => {
    it('should map status, content-type and body to reply when called', async () => {
      const handler = createFastifyPlugin(baseOpts());
      const body = buildBody();
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const req: FastifyRequestLike = {
        url: '/wh',
        headers: { 'stripe-signature': header },
        body: new TextEncoder().encode(body),
      };
      let status = 0;
      let contentType: string | null = null;
      let resBody: string | Uint8Array = '';
      const reply: FastifyReplyLike = {
        code(s) {
          status = s;
          return reply;
        },
        header(name, value) {
          if (name === 'content-type') contentType = value;
          return reply;
        },
        send(b) {
          resBody = b;
        },
      };
      await handler(req, reply);
      expect(status).toBe(200);
      expect(contentType).toMatch(/text\/plain/);
      expect(resBody).toBe('OK');
    });

    it('should accept a string body when fastify provides one', async () => {
      const handler = createFastifyPlugin(baseOpts());
      const body = buildBody('evt_string');
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const req: FastifyRequestLike = {
        url: '/wh',
        headers: { 'stripe-signature': header },
        body, // string
      };
      let status = 0;
      const reply: FastifyReplyLike = {
        code(s) {
          status = s;
          return reply;
        },
        header() {
          return reply;
        },
        send() {},
      };
      await handler(req, reply);
      expect(status).toBe(200);
    });

    it('should fall back to an empty body when fastify provides none', async () => {
      const handler = createFastifyPlugin(baseOpts());
      const req: FastifyRequestLike = {
        url: '/wh',
        headers: { 'stripe-signature': 't=1,v1=ff' },
        body: undefined,
      };
      let status = 0;
      const reply: FastifyReplyLike = {
        code(s) {
          status = s;
          return reply;
        },
        header() {
          return reply;
        },
        send() {},
      };
      await handler(req, reply);
      expect(status).toBe(400);
    });

    it('should join array headers when building the web request', async () => {
      const handler = createFastifyPlugin(baseOpts());
      const body = buildBody('evt_arr');
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const req: FastifyRequestLike = {
        url: '/wh',
        headers: { 'stripe-signature': [header] },
        body,
      };
      let status = 0;
      const reply: FastifyReplyLike = {
        code(s) {
          status = s;
          return reply;
        },
        header() {
          return reply;
        },
        send() {},
      };
      await handler(req, reply);
      expect(status).toBe(200);
    });
  });

  describe('express', () => {
    it('should pass bytes from express.raw through to the handler when called', async () => {
      const handler = createExpressMiddleware(baseOpts());
      const body = buildBody();
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const req: ExpressRequestLike = {
        method: 'POST',
        url: '/wh',
        headers: { 'stripe-signature': header },
        body: new TextEncoder().encode(body),
        on() {},
      };
      let status = 0;
      let bodyOut: Uint8Array | string | undefined;
      const res: ExpressResponseLike = {
        statusCode: 0,
        status(c) {
          status = c;
          return res;
        },
        setHeader() {},
        end(b) {
          bodyOut = b;
        },
      };
      let nextCalled = false;
      await handler(req, res, () => {
        nextCalled = true;
      });
      expect(res.statusCode).toBe(200);
      expect(bodyOut).toBeDefined();
      expect(nextCalled).toBe(false);
      void status; // unused — express middleware doesn't always call status()
    });

    it('should call next(err) when an internal exception escapes', async () => {
      const handler = createExpressMiddleware(baseOpts());
      // Use a req whose .on() throws synchronously (no body provided either).
      const req: ExpressRequestLike = {
        method: 'POST',
        url: '/wh',
        headers: { 'stripe-signature': 't=1,v1=ff' },
        on(event: 'data' | 'end' | 'error') {
          if (event === 'data') throw new Error('cannot subscribe');
        },
      };
      const res: ExpressResponseLike = {
        statusCode: 0,
        status() {
          return res;
        },
        setHeader() {},
        end() {},
      };
      let nextErr: unknown = null;
      await handler(req, res, (err) => {
        nextErr = err;
      });
      expect(nextErr).toBeInstanceOf(Error);
    });

    it('should accept a string body when provided directly', async () => {
      const handler = createExpressMiddleware(baseOpts());
      const body = buildBody('evt_str');
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const req: ExpressRequestLike = {
        method: 'POST',
        url: '/wh',
        headers: { 'stripe-signature': header },
        body,
        on() {},
      };
      const res: ExpressResponseLike = {
        statusCode: 0,
        status() {
          return res;
        },
        setHeader() {},
        end() {},
      };
      await handler(req, res, () => {});
      expect(res.statusCode).toBe(200);
    });
  });

  describe('sveltekit', () => {
    it('should pass event.request through to the handler when invoked', async () => {
      const handler = createSveltekitHandler(baseOpts());
      const event: SveltekitRequestEventLike = {
        request: await buildSignedRequest(buildBody()),
      };
      const r = await handler(event);
      expect(r.status).toBe(200);
    });
  });

  describe('nitro', () => {
    it('should return a (request) => Response shaped function when called', async () => {
      const handler = createNitroHandler(baseOpts());
      const r = await handler(await buildSignedRequest(buildBody()));
      expect(r.status).toBe(200);
    });
  });
});
