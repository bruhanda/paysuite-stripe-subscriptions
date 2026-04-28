import { describe, expect, expectTypeOf, it } from 'vitest';
import { ErrorCodes } from '../errors/codes.js';
import { ConfigError } from '../errors/index.js';
import { definePlans } from '../plans/define.js';
import {
  hasFeature,
  isFeatureEnabled,
  resolveFeatures,
} from '../plans/resolve.js';
import type { FeatureOf, PriceIdOf } from '../plans/types.js';

const plans = definePlans({
  free: { priceId: 'price_free', features: ['basic_export'] },
  pro: {
    priceId: 'price_pro',
    features: ['basic_export', 'custom_domain'],
  },
} as const);

describe('plans', () => {
  describe('definePlans', () => {
    it('should return the same object reference when given a config (purity)', () => {
      const cfg = { a: { priceId: 'price_a', features: ['feat'] } } as const;
      const r = definePlans(cfg);
      expect(r).toBe(cfg);
    });

    it('should brand the config with PlansConfig type when called', () => {
      type Feature = FeatureOf<typeof plans>;
      expectTypeOf<Feature>().toEqualTypeOf<'basic_export' | 'custom_domain'>();
      type Price = PriceIdOf<typeof plans>;
      expectTypeOf<Price>().toEqualTypeOf<'price_free' | 'price_pro'>();
    });
  });

  describe('resolveFeatures', () => {
    it('should return the feature array when the price id is known', () => {
      const r = resolveFeatures(plans, 'price_pro');
      expect(r).toEqual(['basic_export', 'custom_domain']);
    });

    it('should return null when the price id is unknown', () => {
      const r = resolveFeatures(plans, 'price_does_not_exist');
      expect(r).toBeNull();
    });

    it('should narrow the return type to FeatureOf<P> when the price is known', () => {
      const r = resolveFeatures(plans, 'price_free');
      if (r !== null) {
        expectTypeOf(r).toEqualTypeOf<
          ReadonlyArray<'basic_export' | 'custom_domain'>
        >();
      }
    });

    it('should accept any string as the priceId argument when called', () => {
      // (string & {}) widening — should compile and execute without casts.
      const id: string = 'price_pro';
      const r = resolveFeatures(plans, id);
      expect(r).not.toBeNull();
    });
  });

  describe('hasFeature', () => {
    it('should return true when the plan grants the feature', () => {
      expect(hasFeature(plans, 'price_pro', 'custom_domain')).toBe(true);
    });

    it('should return false when the plan does not grant the feature', () => {
      expect(hasFeature(plans, 'price_free', 'custom_domain')).toBe(false);
    });

    it('should throw ConfigError(UNKNOWN_PRICE_ID) when the price id is unknown', () => {
      expect(() =>
        hasFeature(
          plans,
          'price_unknown' as PriceIdOf<typeof plans>,
          'basic_export',
        ),
      ).toThrow(ConfigError);
      try {
        hasFeature(
          plans,
          'price_unknown' as PriceIdOf<typeof plans>,
          'basic_export',
        );
      } catch (e) {
        expect((e as ConfigError).code).toBe(ErrorCodes.UNKNOWN_PRICE_ID);
        expect((e as ConfigError).details).toEqual({ priceId: 'price_unknown' });
      }
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true when the plan grants the feature', () => {
      expect(isFeatureEnabled(plans, 'price_pro', 'basic_export')).toBe(true);
    });

    it('should return false when the plan does not grant the feature', () => {
      expect(isFeatureEnabled(plans, 'price_free', 'custom_domain')).toBe(false);
    });

    it('should return null when the price id is unknown', () => {
      expect(isFeatureEnabled(plans, 'price_unknown', 'basic_export')).toBeNull();
    });
  });
});
