import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { encodeUtf8 } from '../core/encoding.js';
import { isOk } from '../core/result.js';
import { createDispatcher } from '../events/dispatcher.js';
import { withIdempotency } from '../idempotency/guard.js';
import { createMemoryStore } from '../idempotency/store.js';
import { definePlans } from '../plans/define.js';
import { hasFeature, isFeatureEnabled } from '../plans/resolve.js';
import { reduceSubscription } from '../state-machine/reducer.js';
import {
  type SubscriptionState,
} from '../state-machine/reducer.js';
import { createTransitionRouter } from '../state-machine/transition-router.js';
import { validateSubscriptionTransition } from '../state-machine/transitions.js';
import { createRedisStore, type RedisLike } from '../storage/redis/index.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';
import { signPayload } from '../testing/signing.js';
import { VERSION } from '../version.js';
import { createWebhookHandler } from '../webhooks/handler.js';
import {
  type WebhookSecret,
  verifyStripeSignature,
} from '../webhooks/verifier.js';

const SECRET = 'whsec_test_integration' as WebhookSecret;

describe('integration', () => {
  describe('end-to-end webhook flow', () => {
    it('should verify, dispatch, dedupe and persist projection across the full pipeline', async () => {
      const store = createMemoryStore();
      const persisted = new Map<string, SubscriptionState>();

      const dispatcher = createDispatcher()
        .on('customer.subscription.created', (event) => {
          const next = reduceSubscription(null, event);
          persisted.set(next.id, next);
        })
        .on('customer.subscription.updated', (event) => {
          const prev = persisted.get(event.data.object.id) ?? null;
          const next = reduceSubscription(prev, event);
          persisted.set(next.id, next);
        })
        .build();

      const handler = createWebhookHandler({
        secret: SECRET,
        dispatcher,
        store,
      });

      // Created event.
      const createdSub = buildSubscription({
        id: 'sub_int',
        status: 'trialing',
        items: {
          object: 'list',
          data: [
            {
              id: 'si',
              price: { id: 'price_pro' } as Stripe.Price,
              current_period_start: 100,
              current_period_end: 200,
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
      });
      const createdEvent = buildEvent(
        'customer.subscription.created',
        createdSub,
        { id: 'evt_created', created: 1000 },
      );
      const createdBody = JSON.stringify(createdEvent);
      const createdHeader = await signPayload({
        secret: SECRET,
        payload: createdBody,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const createdReq = new Request('http://localhost/', {
        method: 'POST',
        headers: { 'stripe-signature': createdHeader },
        body: createdBody,
      });
      const createdRes = await handler(createdReq);
      expect(createdRes.status).toBe(200);
      expect(persisted.get('sub_int')?.status).toBe('trialing');

      // Updated event.
      const updatedSub = buildSubscription({
        id: 'sub_int',
        status: 'active',
        items: createdSub.items,
      });
      const updatedEvent = buildEvent(
        'customer.subscription.updated',
        updatedSub,
        { id: 'evt_updated', created: 2000 },
      );
      const updatedBody = JSON.stringify(updatedEvent);
      const updatedHeader = await signPayload({
        secret: SECRET,
        payload: updatedBody,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const updatedReq = new Request('http://localhost/', {
        method: 'POST',
        headers: { 'stripe-signature': updatedHeader },
        body: updatedBody,
      });
      const updatedRes = await handler(updatedReq);
      expect(updatedRes.status).toBe(200);
      expect(persisted.get('sub_int')?.status).toBe('active');
    });

    it('should idempotently skip a duplicate event when redelivered', async () => {
      const store = createMemoryStore();
      let dispatched = 0;
      const dispatcher = createDispatcher()
        .on('invoice.paid', () => {
          dispatched++;
        })
        .build();
      const handler = createWebhookHandler({ secret: SECRET, dispatcher, store });

      const body = JSON.stringify({
        id: 'evt_dup',
        type: 'invoice.paid',
        data: { object: { id: 'in_1' } },
      });
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const make = () =>
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': header },
          body,
        });
      await handler(make());
      await handler(make());
      await handler(make());
      expect(dispatched).toBe(1);
    });

    it('should release the claim and let a Stripe retry succeed when the first delivery throws', async () => {
      const store = createMemoryStore();
      let attempts = 0;
      const dispatcher = createDispatcher()
        .on('invoice.paid', () => {
          attempts++;
          if (attempts === 1) throw new Error('flaky downstream');
        })
        .build();
      const handler = createWebhookHandler({ secret: SECRET, dispatcher, store });
      const body = JSON.stringify({
        id: 'evt_retry',
        type: 'invoice.paid',
        data: { object: { id: 'in_1' } },
      });
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
      const make = () =>
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': header },
          body,
        });
      const r1 = await handler(make());
      expect(r1.status).toBe(500);
      const r2 = await handler(make());
      expect(r2.status).toBe(200);
      expect(attempts).toBe(2);
    });
  });

  describe('verifier ↔ signing round-trip', () => {
    it('should produce a header that round-trips through verifyStripeSignature when both are used', async () => {
      const body = JSON.stringify({
        id: 'evt_ok',
        type: 'invoice.paid',
        data: { object: { id: 'in_x' } },
      });
      const tsMs = Date.now();
      const header = await signPayload({
        secret: SECRET,
        payload: body,
        now: () => tsMs,
      });
      const r = await verifyStripeSignature({
        payload: encodeUtf8(body),
        header,
        secret: SECRET,
        now: () => tsMs,
      });
      expect(isOk(r)).toBe(true);
    });
  });

  describe('reducer + transitions + router', () => {
    it('should derive next state, validate transition, and run effects when chained', async () => {
      const router = createTransitionRouter();
      const seen: Array<{ from: string; to: string }> = [];
      router.on('trialing', 'active', (ctx) => {
        seen.push({ from: ctx.from, to: ctx.to });
      });

      const created = buildEvent(
        'customer.subscription.created',
        buildSubscription({ status: 'trialing' }),
        { created: 1000 },
      );
      const updated = buildEvent(
        'customer.subscription.updated',
        buildSubscription({ status: 'active' }),
        { created: 2000 },
      );
      const prev = reduceSubscription(null, created);
      const next = reduceSubscription(prev, updated);
      const validation = validateSubscriptionTransition(prev.status, next.status);
      expect(isOk(validation)).toBe(true);
      await router.run({ from: prev.status, to: next.status, subscription: next });
      expect(seen).toEqual([{ from: 'trialing', to: 'active' }]);
    });
  });

  describe('plans + reducer', () => {
    it('should resolve features for the priceId carried by a reduced subscription', () => {
      const plans = definePlans({
        free: { priceId: 'price_free', features: ['basic'] },
        pro: { priceId: 'price_pro', features: ['basic', 'pro_only'] },
      } as const);

      const sub = buildSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si',
              price: { id: 'price_pro' } as Stripe.Price,
              current_period_start: 0,
              current_period_end: 0,
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
      });
      const event = buildEvent('customer.subscription.created', sub);
      const state = reduceSubscription(null, event);
      const priceId = state.priceId;
      if (priceId === null) throw new Error('expected priceId');
      expect(hasFeature(plans, priceId as 'price_pro', 'pro_only')).toBe(true);
      expect(isFeatureEnabled(plans, priceId, 'basic')).toBe(true);
    });
  });

  describe('redis store + idempotency guard', () => {
    it('should use the redis store under the guard when the full stack is wired', async () => {
      const data = new Map<string, { value: string; expiresAt: number }>();
      const redis: RedisLike = {
        async set(key, value, ...args) {
          const now = Date.now();
          let ex: number | undefined;
          let nx = false;
          for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === 'EX') ex = Number(args[++i]);
            else if (a === 'NX') nx = true;
          }
          const existing = data.get(key);
          if (nx && existing !== undefined && existing.expiresAt > now) return null;
          data.set(key, {
            value,
            expiresAt:
              ex !== undefined ? now + ex * 1000 : Number.MAX_SAFE_INTEGER,
          });
          return 'OK';
        },
        async get(key) {
          const e = data.get(key);
          if (e === undefined) return null;
          if (e.expiresAt <= Date.now()) {
            data.delete(key);
            return null;
          }
          return e.value;
        },
        async del(key) {
          return data.delete(key) ? 1 : 0;
        },
      };
      const store = createRedisStore(redis);
      const fn = vi.fn().mockResolvedValue('ran');
      const r1 = await withIdempotency(store, 'k', fn);
      const r2 = await withIdempotency(store, 'k', fn);
      expect(r1).toEqual({ ran: true, value: 'ran' });
      expect(r2).toEqual({ ran: false, reason: 'duplicate' });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('VERSION', () => {
    it('should expose the current library version when imported', () => {
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});
