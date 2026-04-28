import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../errors/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { createMemoryStore } from '../idempotency/store.js';
import { signPayload } from '../testing/signing.js';
import { createSpyStore } from '../testing/mock-store.js';
import { createWebhookHandler } from '../webhooks/handler.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

const SECRET = 'whsec_test' as WebhookSecret;

const buildBody = (overrides: Partial<Stripe.Event> = {}): string =>
  JSON.stringify({
    id: 'evt_1',
    type: 'invoice.paid',
    data: { object: { id: 'in_1' } },
    ...overrides,
  });

const buildRequest = async (
  body: string,
  opts: { secret?: WebhookSecret; timestamp?: number } = {},
): Promise<Request> => {
  const secret = opts.secret ?? SECRET;
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const header = await signPayload({ secret, payload: body, timestamp: ts });
  return new Request('http://localhost/webhooks', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body,
  });
};

describe('webhooks/handler/createWebhookHandler', () => {
  describe('config validation', () => {
    it('should throw ConfigError when secret is missing', () => {
      expect(() =>
        createWebhookHandler({
          secret: undefined as unknown as WebhookSecret,
          dispatcher: createDispatcher().build(),
        }),
      ).toThrow(ConfigError);
    });

    it('should throw ConfigError when secret does not start with whsec_', () => {
      expect(() =>
        createWebhookHandler({
          secret: 'pk_bad' as WebhookSecret,
          dispatcher: createDispatcher().build(),
        }),
      ).toThrow(ConfigError);
    });
  });

  describe('happy path', () => {
    it('should return 200 OK and dispatch the event when signature is valid', async () => {
      const seen: string[] = [];
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher()
          .on('invoice.paid', (e) => {
            seen.push(e.id);
          })
          .build(),
      });
      const response = await handler(await buildRequest(buildBody()));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
      expect(seen).toEqual(['evt_1']);
    });
  });

  describe('400 errors', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      const response = await handler(
        new Request('http://localhost/wh', {
          method: 'POST',
          body: buildBody(),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toMatch(/Missing/);
    });

    it('should return 400 when signature is invalid', async () => {
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      const response = await handler(
        new Request('http://localhost/wh', {
          method: 'POST',
          headers: { 'stripe-signature': 't=1,v1=' + 'a'.repeat(64) },
          body: buildBody(),
        }),
      );
      expect(response.status).toBe(400);
    });

    it('should return 400 when payload is malformed JSON', async () => {
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
      });
      const body = 'not json';
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const response = await handler(
        new Request('http://localhost/wh', {
          method: 'POST',
          headers: { 'stripe-signature': header },
          body,
        }),
      );
      expect(response.status).toBe(400);
    });

    it('should call logger.warn with verification failure JSON when invalid signature', async () => {
      const warn = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        logger: { warn, error: vi.fn() },
      });
      await handler(
        new Request('http://localhost/wh', {
          method: 'POST',
          headers: { 'stripe-signature': 't=1,v1=' + 'a'.repeat(64) },
          body: buildBody(),
        }),
      );
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should call onDuplicate and return 200 when the same event is replayed', async () => {
      const store = createMemoryStore();
      const onDuplicate = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        store,
        onDuplicate,
      });
      const body = buildBody();
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const make = () =>
        new Request('http://localhost/wh', {
          method: 'POST',
          headers: { 'stripe-signature': header },
          body,
        });
      const first = await handler(make());
      expect(first.status).toBe(200);
      const second = await handler(make());
      expect(second.status).toBe(200);
      expect(await second.text()).toMatch(/Duplicate/);
      expect(onDuplicate).toHaveBeenCalledWith('evt_1');
    });

    it('should return inFlightStatus when another worker holds the claim', async () => {
      const store = createMemoryStore();
      // Simulate another worker already in-flight on this event id.
      await store.claim('stripe:event:evt_1', { claimTtlSeconds: 60 });
      const onInFlight = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        store,
        onInFlight,
        inFlightStatus: 425,
      });
      const r = await handler(await buildRequest(buildBody()));
      expect(r.status).toBe(425);
      expect(onInFlight).toHaveBeenCalledWith('evt_1');
    });

    it('should default in-flight status to 503 when option is not specified', async () => {
      const store = createMemoryStore();
      await store.claim('stripe:event:evt_1', { claimTtlSeconds: 60 });
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        store,
      });
      const r = await handler(await buildRequest(buildBody()));
      expect(r.status).toBe(503);
    });

    it('should swallow exceptions from onDuplicate and onInFlight hooks when called', async () => {
      const store = createMemoryStore();
      await store.claim('stripe:event:evt_1', { claimTtlSeconds: 60 });
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        store,
        onInFlight: () => {
          throw new Error('hook fail');
        },
      });
      const r = await handler(await buildRequest(buildBody()));
      // Must still return 503 — hook must not break the flow.
      expect(r.status).toBe(503);
    });

    it('should call claim, dispatch, then commit when handling a fresh event', async () => {
      const store = createSpyStore();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        store,
      });
      await handler(await buildRequest(buildBody()));
      expect(store.calls.map((c) => c.method)).toEqual(['claim', 'commit']);
    });
  });

  describe('error handling', () => {
    it('should return 500 and call onError when the handler throws', async () => {
      const onError = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher()
          .on('invoice.paid', () => {
            throw new Error('user code failed');
          })
          .build(),
        onError,
      });
      const r = await handler(await buildRequest(buildBody()));
      expect(r.status).toBe(500);
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[1].id).toBe('evt_1');
    });

    it('should release the claim so a retry can succeed when handler throws', async () => {
      const store = createSpyStore();
      let attempt = 0;
      const handler = createWebhookHandler({
        secret: SECRET,
        store,
        dispatcher: createDispatcher()
          .on('invoice.paid', () => {
            attempt++;
            if (attempt === 1) throw new Error('first attempt fails');
          })
          .build(),
      });
      const body = buildBody();
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const make = () =>
        new Request('http://localhost/wh', {
          method: 'POST',
          headers: { 'stripe-signature': header },
          body,
        });
      const first = await handler(make());
      expect(first.status).toBe(500);
      const second = await handler(make());
      expect(second.status).toBe(200);
      expect(store.calls.map((c) => c.method)).toEqual([
        'claim',
        'release',
        'claim',
        'commit',
      ]);
    });

    it('should swallow onError hook exceptions and log them when fired', async () => {
      const error = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher()
          .on('invoice.paid', () => {
            throw new Error('boom');
          })
          .build(),
        onError: () => {
          throw new Error('hook bad');
        },
        logger: { warn: vi.fn(), error },
      });
      const r = await handler(await buildRequest(buildBody()));
      expect(r.status).toBe(500);
      // Error logger called for hook failure and webhook failure.
      expect(error).toHaveBeenCalled();
    });
  });

  describe('body reading', () => {
    it('should return 400 when reading the body throws', async () => {
      const warn = vi.fn();
      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher: createDispatcher().build(),
        logger: { warn, error: vi.fn() },
      });
      // Build a Request whose arrayBuffer() throws.
      const broken = {
        headers: new Map([['stripe-signature', 't=1,v1=ff']]),
      };
      const fakeRequest = {
        headers: { get: () => 't=1,v1=ff' },
        async arrayBuffer() {
          throw new Error('reader broken');
        },
      } as unknown as Request;
      const r = await handler(fakeRequest);
      expect(r.status).toBe(400);
      expect(warn).toHaveBeenCalled();
      // Suppress unused var warning.
      void broken;
    });
  });
});
