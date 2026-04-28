import type Stripe from 'stripe';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type EventDispatcher,
  type SealedDispatcher,
  createDispatcher,
} from '../events/dispatcher.js';
import { buildEvent, buildSubscription } from '../testing/factories.js';

describe('events/dispatcher', () => {
  describe('createDispatcher', () => {
    it('should return an empty builder when called with no args', () => {
      const d = createDispatcher();
      expectTypeOf(d).toEqualTypeOf<EventDispatcher<never>>();
      const built = d.build();
      expect(built.registered.size).toBe(0);
    });
  });

  describe('on', () => {
    it('should register a typed handler that receives narrowed events when dispatched', async () => {
      const seen: Stripe.Event[] = [];
      const dispatcher = createDispatcher()
        .on('customer.subscription.updated', (event) => {
          // event is narrowed to customer.subscription.updated
          seen.push(event);
        })
        .build();

      const event = buildEvent(
        'customer.subscription.updated',
        buildSubscription({ status: 'past_due' }),
      );
      await dispatcher.dispatch(event);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.type).toBe('customer.subscription.updated');
    });

    it('should expose the registered set on the sealed dispatcher when built', () => {
      const dispatcher = createDispatcher()
        .on('customer.subscription.updated', () => {})
        .on('invoice.paid', () => {})
        .build();
      expect(dispatcher.registered.has('customer.subscription.updated')).toBe(true);
      expect(dispatcher.registered.has('invoice.paid')).toBe(true);
      expect(dispatcher.registered.size).toBe(2);
    });

    it('should be immutable across .on() calls when chaining', async () => {
      const ranA: number[] = [];
      const ranB: number[] = [];
      const a = createDispatcher().on('invoice.paid', () => {
        ranA.push(1);
      });
      // Branching: a different `.on()` from `a` does NOT mutate `a`.
      const b = a.on('checkout.session.completed', () => {
        ranB.push(1);
      });
      const aBuilt = a.build();
      const bBuilt = b.build();

      expect(aBuilt.registered.has('invoice.paid')).toBe(true);
      expect(aBuilt.registered.has('checkout.session.completed')).toBe(false);
      expect(bBuilt.registered.has('checkout.session.completed')).toBe(true);
    });

    it('should support async handlers when dispatched', async () => {
      const order: string[] = [];
      const dispatcher = createDispatcher()
        .on('invoice.paid', async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push('typed');
        })
        .build();
      // Cast to widest event shape; cheap test fixture for dispatch.
      const event = { id: 'evt', type: 'invoice.paid', data: { object: {} } } as unknown as Stripe.Event;
      await dispatcher.dispatch(event);
      expect(order).toEqual(['typed']);
    });
  });

  describe('onAny', () => {
    it('should run for every dispatched event when registered', async () => {
      const seen: string[] = [];
      const dispatcher = createDispatcher()
        .onAny((event) => {
          seen.push(event.type);
        })
        .build();
      const e1 = { type: 'a', id: 'e1', data: { object: {} } } as unknown as Stripe.Event;
      const e2 = { type: 'b', id: 'e2', data: { object: {} } } as unknown as Stripe.Event;
      await dispatcher.dispatch(e1);
      await dispatcher.dispatch(e2);
      expect(seen).toEqual(['a', 'b']);
    });

    it('should run after the matching typed handler when both are registered', async () => {
      const order: string[] = [];
      const dispatcher = createDispatcher()
        .on('invoice.paid', () => {
          order.push('typed');
        })
        .onAny(() => {
          order.push('any');
        })
        .build();
      const e = { type: 'invoice.paid', id: 'evt', data: { object: {} } } as unknown as Stripe.Event;
      await dispatcher.dispatch(e);
      expect(order).toEqual(['typed', 'any']);
    });

    it('should run multiple onAny handlers in registration order when chained', async () => {
      const order: string[] = [];
      const dispatcher = createDispatcher()
        .onAny(() => {
          order.push('1');
        })
        .onAny(() => {
          order.push('2');
        })
        .onAny(() => {
          order.push('3');
        })
        .build();
      const e = { type: 'invoice.paid', id: 'e', data: { object: {} } } as unknown as Stripe.Event;
      await dispatcher.dispatch(e);
      expect(order).toEqual(['1', '2', '3']);
    });

    it('should NOT run when the typed handler throws — propagates the throw', async () => {
      const ranAny: string[] = [];
      const dispatcher = createDispatcher()
        .on('invoice.paid', () => {
          throw new Error('boom');
        })
        .onAny(() => {
          ranAny.push('any');
        })
        .build();
      const e = { type: 'invoice.paid', id: 'e', data: { object: {} } } as unknown as Stripe.Event;
      await expect(dispatcher.dispatch(e)).rejects.toThrow('boom');
      expect(ranAny).toEqual([]);
    });
  });

  describe('dispatch', () => {
    it('should not call any handler when no handler is registered for the event type', async () => {
      const dispatcher = createDispatcher()
        .on('invoice.paid', () => {
          throw new Error('should not run');
        })
        .build();
      const e = { type: 'customer.created', id: 'e', data: { object: {} } } as unknown as Stripe.Event;
      await expect(dispatcher.dispatch(e)).resolves.toBeUndefined();
    });

    it('should await handlers sequentially when multiple are registered', async () => {
      const order: string[] = [];
      const dispatcher = createDispatcher()
        .on('invoice.paid', async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push('typed');
        })
        .onAny(async () => {
          await new Promise((r) => setTimeout(r, 1));
          order.push('any1');
        })
        .onAny(() => {
          order.push('any2');
        })
        .build();
      const e = { type: 'invoice.paid', id: 'e', data: { object: {} } } as unknown as Stripe.Event;
      await dispatcher.dispatch(e);
      expect(order).toEqual(['typed', 'any1', 'any2']);
    });
  });

  describe('build', () => {
    it('should return a SealedDispatcher with proper type when called', () => {
      const d = createDispatcher().on('invoice.paid', () => {});
      const sealed = d.build();
      expectTypeOf(sealed).toMatchTypeOf<SealedDispatcher<'invoice.paid'>>();
    });

    it('should snapshot internals so post-build .on calls do not affect the sealed dispatcher when modified', async () => {
      const builder = createDispatcher();
      const built = builder.build();
      // Adding more handlers via the builder does not affect the already-built dispatcher.
      builder.on('invoice.paid', () => {
        throw new Error('should not run');
      });
      const e = { type: 'invoice.paid', id: 'e', data: { object: {} } } as unknown as Stripe.Event;
      await expect(built.dispatch(e)).resolves.toBeUndefined();
    });
  });
});
