import { describe, expect, it } from 'vitest';
import {
  config,
  createNextApiHandler,
  createNextRouteHandler,
} from '../adapters/next/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { signPayload } from '../testing/signing.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_next_test' as WebhookSecret;

const buildRequest = async (body: string): Promise<Request> => {
  const ts = Math.floor(Date.now() / 1000);
  const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
  return new Request('http://localhost/wh', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body,
  });
};

describe('adapters/next', () => {
  describe('createNextRouteHandler (App Router)', () => {
    it('should return an object with a POST handler when called', () => {
      const handler = createNextRouteHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      expect(typeof handler.POST).toBe('function');
    });

    it('should process a valid signed request and return 200 when called', async () => {
      const body = JSON.stringify({
        id: 'evt_app',
        type: 'invoice.paid',
        data: { object: { id: 'in_1' } },
      });
      const handler = createNextRouteHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      const response = await handler.POST(await buildRequest(body));
      expect(response.status).toBe(200);
    });

    it('should reject with 400 when stripe-signature header is missing', async () => {
      const handler = createNextRouteHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      const response = await handler.POST(
        new Request('http://localhost/wh', { method: 'POST', body: 'x' }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe('createNextApiHandler (Pages Router)', () => {
    it('should read body from a Node-style stream and return 200 when valid', async () => {
      const body = JSON.stringify({
        id: 'evt_pages',
        type: 'invoice.paid',
        data: { object: { id: 'in_1' } },
      });
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });

      const listeners = {
        data: [] as Array<(c: Uint8Array) => void>,
        end: [] as Array<() => void>,
        error: [] as Array<(e: Error) => void>,
      };
      const req = {
        method: 'POST',
        url: '/wh',
        headers: { 'stripe-signature': header },
        on(event: 'data' | 'end' | 'error', listener: never) {
          listeners[event].push(listener as never);
        },
      };
      let statusCode = 0;
      let bodyOut: Uint8Array | string | undefined;
      const headers: Record<string, string> = {};
      const res = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(v: number) {
          statusCode = v;
        },
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        end(b?: string | Uint8Array) {
          bodyOut = b;
        },
      };

      const handlerPromise = createNextApiHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      })(req, res);

      // Drive the fake Node stream — schedule data + end on next microtask.
      queueMicrotask(() => {
        for (const l of listeners.data) l(new TextEncoder().encode(body));
        for (const l of listeners.end) l();
      });

      await handlerPromise;
      expect(statusCode).toBe(200);
      expect(typeof bodyOut !== 'undefined').toBe(true);
    });
  });

  describe('config', () => {
    it('should disable bodyParser for the Pages Router config when imported', () => {
      expect(config).toEqual({ api: { bodyParser: false } });
    });
  });
});
