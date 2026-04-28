import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createCliBridge } from '../testing/cli-bridge.js';

const event = (type: string, id = 'evt_1'): Stripe.Event =>
  ({ id, type, data: { object: {} } }) as unknown as Stripe.Event;

describe('testing/cli-bridge/createCliBridge', () => {
  it('should fan out a pushed event to a single subscriber when called', () => {
    const bridge = createCliBridge();
    const seen: string[] = [];
    bridge.onEvent((e) => {
      seen.push(e.type);
    });
    bridge.push(event('invoice.paid'));
    expect(seen).toEqual(['invoice.paid']);
  });

  it('should fan out a pushed event to multiple subscribers when several are registered', () => {
    const bridge = createCliBridge();
    const seenA: string[] = [];
    const seenB: string[] = [];
    bridge.onEvent((e) => {
      seenA.push(e.id);
    });
    bridge.onEvent((e) => {
      seenB.push(e.id);
    });
    bridge.push(event('invoice.paid', 'evt_x'));
    expect(seenA).toEqual(['evt_x']);
    expect(seenB).toEqual(['evt_x']);
  });

  it('should be a no-op when push is called with no subscribers', () => {
    const bridge = createCliBridge();
    expect(() => bridge.push(event('x'))).not.toThrow();
  });

  it('should not retroactively deliver events to a late subscriber when called', () => {
    const bridge = createCliBridge();
    bridge.push(event('past'));
    const seen: string[] = [];
    bridge.onEvent((e) => {
      seen.push(e.type);
    });
    expect(seen).toEqual([]);
  });

  it('should keep separate bridges isolated when both are used', () => {
    const a = createCliBridge();
    const b = createCliBridge();
    const seenA: string[] = [];
    a.onEvent((e) => {
      seenA.push(e.type);
    });
    b.push(event('not-on-a'));
    expect(seenA).toEqual([]);
  });
});
