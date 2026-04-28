import type { PlanConfigInput, PlansConfig } from './types.js';

/**
 * Define the set of plans your application offers. Pass the object literal
 * with `as const` to unlock literal-type inference: feature unions, price-id
 * autocompletion, and exhaustive plan-name checks all flow from this single
 * declaration.
 *
 * @param plans - The plan map; each plan declares a Stripe `priceId` and a
 *                literal-typed `features` array.
 * @returns The same object, branded as a {@link PlansConfig} at the type
 *          level. The runtime value is unchanged.
 *
 * @example
 * ```ts
 * const plans = definePlans({
 *   free: { priceId: 'price_free', features: ['basic_export'] },
 *   pro:  { priceId: 'price_1Oabc', features: ['basic_export', 'custom_domain'] },
 * } as const);
 *
 * type Feature = FeatureOf<typeof plans>;
 * //   ^? 'basic_export' | 'custom_domain'
 * ```
 */
export function definePlans<const P extends PlanConfigInput>(plans: P): PlansConfig<P> {
  // Cast: `__brand` is a virtual marker — present only in the type, never on
  // the runtime object. Attaching it at runtime would change `Object.keys`
  // iteration (every consumer would have to skip it), and `definePlans` is
  // pure / cache-friendly the way it is.
  return plans as PlansConfig<P>;
}
