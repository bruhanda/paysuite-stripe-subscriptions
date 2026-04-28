import type Stripe from 'stripe';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { encodeUtf8 } from '../core/encoding.js';
import { isOk } from '../core/result.js';
import { createCliBridge } from '../testing/cli-bridge.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';
import { createSpyStore } from '../testing/mock-store.js';
import { signPayload } from '../testing/signing.js';
import {
  type WebhookSecret,
  verifyStripeSignature,
} from '../webhooks/verifier.js';

const SECRET = 'whsec_testing_helpers' as WebhookSecret;

describe('testing helpers', () => {
  describe('factories/buildSubscription', () => {
    it('should produce a Stripe.Subscription with sensible defaults when called without overrides', () => {
      const sub = buildSubscription();
      expect(sub.id).toBe('sub_test_default');
      expect(sub.status).toBe('active');
      expect(sub.items.data).toEqual([]);
    });

    it('should merge overrides over the defaults when called', () => {
      const sub = buildSubscription({ id: 'sub_x', status: 'past_due' });
      expect(sub.id).toBe('sub_x');
      expect(sub.status).toBe('past_due');
    });

    it('should return fresh nested objects so mutation does not leak across calls', () => {
      const a = buildSubscription();
      const b = buildSubscription();
      // Mutating one's metadata must not affect the other.
      (a.metadata as Record<string, unknown>).foo = 'bar';
      expect((b.metadata as Record<string, unknown>).foo).toBeUndefined();
    });
  });

  describe('factories/buildEvent', () => {
    it('should produce a typed Stripe.Event when given a name and object', () => {
      const event = buildEvent(
        'customer.subscription.updated',
        buildSubscription({ status: 'active' }),
      );
      expect(event.type).toBe('customer.subscription.updated');
      expect(event.data.object.status).toBe('active');
      expectTypeOf(event.data.object).toMatchTypeOf<Stripe.Subscription>();
    });

    it('should accept event-level overrides like id and created when given', () => {
      const event = buildEvent(
        'invoice.paid',
        // The factory's data.object is constrained — pass a minimal Invoice fixture.
        { id: 'in_1' } as unknown as Stripe.Invoice,
        { id: 'evt_overridden', created: 12345 },
      );
      expect(event.id).toBe('evt_overridden');
      expect(event.created).toBe(12345);
    });
  });

  describe('signing/signPayload', () => {
    it('should produce a header with t= and v1= segments when called', async () => {
      const header = await signPayload({
        secret: SECRET,
        payload: 'data',
        timestamp: 1000,
      });
      expect(header).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
    });

    it('should produce a header that verifies against verifyStripeSignature when used together', async () => {
      const body = '{"id":"e","type":"t","data":{"object":{"id":"x"}}}';
      const ts = Math.floor(Date.now() / 1000);
      const header = await signPayload({
        secret: SECRET,
        payload: body,
        timestamp: ts,
      });
      const r = await verifyStripeSignature({
        payload: encodeUtf8(body),
        header,
        secret: SECRET,
      });
      expect(isOk(r)).toBe(true);
    });

    it('should accept Uint8Array payloads when signing', async () => {
      const header = await signPayload({
        secret: SECRET,
        payload: new TextEncoder().encode('bytes'),
        timestamp: 1234,
      });
      expect(header.startsWith('t=1234,')).toBe(true);
    });

    it('should use the now override to derive the timestamp when timestamp is omitted', async () => {
      const header = await signPayload({
        secret: SECRET,
        payload: 'x',
        now: () => 5_000_000,
      });
      expect(header.startsWith('t=5000,')).toBe(true);
    });
  });

  describe('mock-store/createSpyStore', () => {
    it('should record calls in order when delegating to the underlying memory store', async () => {
      const store = createSpyStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.delete('k');
      expect(store.calls).toEqual([
        { method: 'claim', key: 'k' },
        { method: 'commit', key: 'k' },
        { method: 'delete', key: 'k' },
      ]);
    });

    it('should record release calls when invoked', async () => {
      const store = createSpyStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.release('k');
      expect(store.calls.map((c) => c.method)).toEqual(['claim', 'release']);
    });

    it('should clear the call log and reset the underlying store when reset() is called', async () => {
      const store = createSpyStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      store.reset();
      expect(store.calls).toEqual([]);
      // After reset, claim succeeds again on the same key.
      const r = await store.claim('k', { claimTtlSeconds: 60 });
      expect(r).toBe('claimed');
    });
  });

  describe('cli-bridge/createCliBridge', () => {
    it('should fan out pushed events to every registered listener when called', () => {
      const bridge = createCliBridge();
      const a: string[] = [];
      const b: string[] = [];
      bridge.onEvent((e) => a.push(e.id));
      bridge.onEvent((e) => b.push(e.id));
      bridge.push({ id: 'evt_1' } as Stripe.Event);
      bridge.push({ id: 'evt_2' } as Stripe.Event);
      expect(a).toEqual(['evt_1', 'evt_2']);
      expect(b).toEqual(['evt_1', 'evt_2']);
    });

    it('should be a no-op when push is called with no listeners', () => {
      const bridge = createCliBridge();
      expect(() => bridge.push({ id: 'evt' } as Stripe.Event)).not.toThrow();
    });
  });
});
