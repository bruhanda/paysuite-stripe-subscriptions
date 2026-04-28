/**
 * Advanced usage — production-shaped subscription pipeline.
 *
 * Walks through the parts most apps need together:
 *
 *   - definePlans + resolveFeatures + isFeatureEnabled (typed price → feature)
 *   - reduceSubscription (event-sourced projection ready for a DB upsert)
 *   - validateSubscriptionTransition (state-machine guard for hand-off transitions)
 *   - createTransitionRouter (typed side-effects per (from, to) pair)
 *   - withIdempotency (claim → run → commit, replay-safe)
 *   - PaySuiteError handling (toJSON for structured logs)
 *
 * Run:
 *   npx tsx examples/advanced-usage.ts
 */
import type { ErrorCode } from '@paysuite/stripe-subscriptions/errors';
import {
  type FeatureOf,
  definePlans,
  hasFeature,
  isFeatureEnabled,
  resolveFeatures,
} from '@paysuite/stripe-subscriptions/plans';
import {
  createTransitionRouter,
  reduceSubscription,
  type SubscriptionState,
  validateSubscriptionTransition,
} from '@paysuite/stripe-subscriptions/state-machine';
import { createMemoryStore } from '@paysuite/stripe-subscriptions/storage/memory';
import { withIdempotency } from '@paysuite/stripe-subscriptions/idempotency';
import { buildEvent, buildSubscription } from '@paysuite/stripe-subscriptions/testing';

const plans = definePlans({
  free: { priceId: 'price_free', features: ['basic_export'] },
  pro: {
    priceId: 'price_pro_monthly',
    features: ['basic_export', 'custom_domain', 'ai_credits'],
  },
  team: {
    priceId: 'price_team_monthly',
    features: ['basic_export', 'custom_domain', 'ai_credits', 'sso', 'audit_log'],
  },
} as const);

type Feature = FeatureOf<typeof plans>;

const subscriptions = new Map<string, SubscriptionState>();

const router = createTransitionRouter()
  .on('trialing', 'active', async ({ subscription }) => {
    console.log(`[email] welcome → ${subscription.customerId}`);
  })
  .on('active', 'past_due', async ({ subscription }) => {
    console.log(`[ops] dunning entered for ${subscription.customerId}`);
  })
  .on('past_due', 'canceled', async ({ subscription }) => {
    console.log(`[downgrade] ${subscription.customerId} → free plan`);
  });

const store = createMemoryStore();

async function applyEvent(
  event: ReturnType<typeof buildEvent<'customer.subscription.updated'>>,
): Promise<void> {
  const result = await withIdempotency(
    store,
    `stripe:event:${event.id}`,
    async () => {
      const prev = subscriptions.get(event.data.object.id) ?? null;
      const next = reduceSubscription(prev, event);

      if (prev !== null) {
        const transition = validateSubscriptionTransition(prev.status, next.status);
        if (!transition.ok) {
          console.warn('[guard]', transition.error.toJSON());
          return;
        }
        await router.run({ from: prev.status, to: next.status, subscription: next });
      }

      subscriptions.set(next.id, next);
      console.log(`[db] upsert ${next.id} status=${next.status} priceId=${next.priceId}`);
    },
    { claimTtlSeconds: 30, commitTtlSeconds: 60 * 60 * 24 * 7 },
  );

  if (!result.ran) {
    console.log(`[idempotency] skipped event ${event.id} (${result.reason})`);
  }
}

function priceIdFor(plan: 'free' | 'pro' | 'team'): string {
  return plans[plan].priceId;
}

function buildSubEvent(
  type: 'customer.subscription.created' | 'customer.subscription.updated',
  overrides: {
    id: string;
    customerId: string;
    status:
      | 'incomplete'
      | 'incomplete_expired'
      | 'trialing'
      | 'active'
      | 'past_due'
      | 'canceled'
      | 'unpaid'
      | 'paused';
    plan: 'free' | 'pro' | 'team';
    eventId: string;
    createdAt: number;
  },
): ReturnType<typeof buildEvent<'customer.subscription.updated'>> {
  const sub = buildSubscription({
    id: overrides.id,
    customer: overrides.customerId,
    status: overrides.status,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_demo',
          object: 'subscription_item',
          price: { id: priceIdFor(overrides.plan), object: 'price' },
          current_period_start: overrides.createdAt - 60,
          current_period_end: overrides.createdAt + 60 * 60 * 24 * 30,
        },
      ] as never,
      has_more: false,
      url: '/v1/subscription_items',
    },
  });
  return buildEvent(type, sub, {
    id: overrides.eventId,
    created: overrides.createdAt,
  }) as ReturnType<typeof buildEvent<'customer.subscription.updated'>>;
}

async function gatedRequest(priceId: string, feature: Feature): Promise<void> {
  const enabled = isFeatureEnabled(plans, priceId, feature);
  if (enabled === null) {
    console.warn(`[gate] unknown price id ${priceId} — denying ${feature}`);
    return;
  }
  console.log(`[gate] ${priceId} ${enabled ? 'GRANTS' : 'denies'} ${feature}`);
}

async function main(): Promise<void> {
  console.log('--- feature lookup ---');
  console.log('pro features:', resolveFeatures(plans, plans.pro.priceId));
  await gatedRequest(plans.pro.priceId, 'custom_domain');
  await gatedRequest(plans.free.priceId, 'sso');
  await gatedRequest('price_unknown_999', 'sso');

  console.log('\n--- event stream ---');
  const t0 = Math.floor(Date.now() / 1000);
  await applyEvent(
    buildSubEvent('customer.subscription.created', {
      id: 'sub_demo',
      customerId: 'cus_demo',
      status: 'trialing',
      plan: 'pro',
      eventId: 'evt_1',
      createdAt: t0,
    }),
  );
  await applyEvent(
    buildSubEvent('customer.subscription.updated', {
      id: 'sub_demo',
      customerId: 'cus_demo',
      status: 'active',
      plan: 'pro',
      eventId: 'evt_2',
      createdAt: t0 + 10,
    }),
  );
  await applyEvent(
    buildSubEvent('customer.subscription.updated', {
      id: 'sub_demo',
      customerId: 'cus_demo',
      status: 'past_due',
      plan: 'pro',
      eventId: 'evt_3',
      createdAt: t0 + 20,
    }),
  );
  await applyEvent(
    buildSubEvent('customer.subscription.updated', {
      id: 'sub_demo',
      customerId: 'cus_demo',
      status: 'canceled',
      plan: 'pro',
      eventId: 'evt_4',
      createdAt: t0 + 30,
    }),
  );

  console.log('\n--- replay evt_2 ---');
  await applyEvent(
    buildSubEvent('customer.subscription.updated', {
      id: 'sub_demo',
      customerId: 'cus_demo',
      status: 'active',
      plan: 'pro',
      eventId: 'evt_2',
      createdAt: t0 + 10,
    }),
  );

  console.log('\n--- structured error from hasFeature on unknown id ---');
  try {
    hasFeature(plans, 'price_unknown_999' as never, 'sso');
  } catch (err) {
    if (isPaySuiteError(err)) {
      console.log('caught PaySuiteError:', err.toJSON());
    } else {
      throw err;
    }
  }
}

interface PaySuiteLike extends Error {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  toJSON(): unknown;
}

function isPaySuiteError(value: unknown): value is PaySuiteLike {
  return (
    value instanceof Error &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
