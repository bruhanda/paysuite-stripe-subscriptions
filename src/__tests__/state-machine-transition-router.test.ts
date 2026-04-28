import { describe, expect, it } from 'vitest';
import {
  type SubscriptionState,
  reduceSubscription,
} from '../state-machine/reducer.js';
import { createTransitionRouter } from '../state-machine/transition-router.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';

const SUB_STATE: SubscriptionState = {
  id: 'sub_1',
  customerId: 'cus_1',
  status: 'active',
  priceId: 'price_pro',
  currentPeriodStart: 100,
  currentPeriodEnd: 200,
  cancelAtPeriodEnd: false,
  trialEnd: null,
  updatedAt: 1000,
};

describe('state-machine/transition-router/createTransitionRouter', () => {
  describe('on / run', () => {
    it('should run a registered effect when the (from, to) pair matches', async () => {
      const seen: string[] = [];
      const router = createTransitionRouter().on('trialing', 'active', (ctx) => {
        seen.push(`${ctx.from}->${ctx.to}:${ctx.subscription.id}`);
      });
      await router.run({ from: 'trialing', to: 'active', subscription: SUB_STATE });
      expect(seen).toEqual(['trialing->active:sub_1']);
    });

    it('should support chained .on() calls when registering multiple effects', async () => {
      const calls: string[] = [];
      const router = createTransitionRouter()
        .on('trialing', 'active', () => calls.push('a'))
        .on('past_due', 'canceled', () => calls.push('b'));
      await router.run({ from: 'trialing', to: 'active', subscription: SUB_STATE });
      await router.run({ from: 'past_due', to: 'canceled', subscription: SUB_STATE });
      expect(calls).toEqual(['a', 'b']);
    });

    it('should be a no-op when no effect matches the (from, to) pair', async () => {
      const router = createTransitionRouter().on('trialing', 'active', () => {
        throw new Error('should not run');
      });
      await expect(
        router.run({ from: 'active', to: 'past_due', subscription: SUB_STATE }),
      ).resolves.toBeUndefined();
    });

    it('should run multiple effects for the same pair in registration order when fired', async () => {
      const order: number[] = [];
      const router = createTransitionRouter()
        .on('trialing', 'active', () => {
          order.push(1);
        })
        .on('trialing', 'active', async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push(2);
        })
        .on('trialing', 'active', () => {
          order.push(3);
        });
      await router.run({ from: 'trialing', to: 'active', subscription: SUB_STATE });
      expect(order).toEqual([1, 2, 3]);
    });

    it('should not share state between independent router instances when both are used', async () => {
      const sentA: string[] = [];
      const sentB: string[] = [];
      const a = createTransitionRouter().on('trialing', 'active', () => {
        sentA.push('a');
      });
      const b = createTransitionRouter().on('trialing', 'active', () => {
        sentB.push('b');
      });
      await a.run({ from: 'trialing', to: 'active', subscription: SUB_STATE });
      expect(sentA).toEqual(['a']);
      expect(sentB).toEqual([]);
    });

    it('should propagate errors from an effect when it throws', async () => {
      const router = createTransitionRouter().on('trialing', 'active', () => {
        throw new Error('effect failed');
      });
      await expect(
        router.run({ from: 'trialing', to: 'active', subscription: SUB_STATE }),
      ).rejects.toThrow('effect failed');
    });

    it('should pair correctly with reduceSubscription when running on a real transition', async () => {
      const calls: Array<{ from: string; to: string }> = [];
      const router = createTransitionRouter().on('trialing', 'active', (ctx) => {
        calls.push({ from: ctx.from, to: ctx.to });
      });
      const prev = reduceSubscription(
        null,
        buildEvent(
          'customer.subscription.created',
          buildSubscription({ status: 'trialing' }),
          { created: 1000 },
        ),
      );
      const next = reduceSubscription(
        prev,
        buildEvent(
          'customer.subscription.updated',
          buildSubscription({ status: 'active' }),
          { created: 2000 },
        ),
      );
      await router.run({
        from: prev.status,
        to: next.status,
        subscription: next,
      });
      expect(calls).toEqual([{ from: 'trialing', to: 'active' }]);
    });
  });
});
