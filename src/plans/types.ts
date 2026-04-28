/**
 * Shape constraint accepted by {@link definePlans}. Every plan declares a
 * Stripe price id and a list of feature literals that membership grants.
 *
 * The `readonly` qualifier on `features` is load-bearing: it preserves
 * literal types when the caller passes the object with `as const`, which
 * is what unlocks `FeatureOf<typeof plans>` inference.
 */
export type PlanConfigInput = {
  readonly [planName: string]: {
    readonly priceId: string;
    readonly features: readonly string[];
  };
};

/**
 * Branded result of {@link definePlans}. The `__brand` field is virtual —
 * not present on the runtime object, only in the type — and exists to
 * prevent callers from passing a raw object literal to {@link resolveFeatures}.
 */
export type PlansConfig<P extends PlanConfigInput> = P & {
  readonly __brand: 'PlansConfig';
};

/** Union of all plan names declared in `definePlans`. */
export type PlanNameOf<P> = P extends PlansConfig<infer I>
  ? Extract<keyof I, string>
  : never;

/** Union of all `priceId` literals declared in `definePlans`. */
export type PriceIdOf<P> = P extends PlansConfig<infer I>
  ? I[keyof I]['priceId']
  : never;

/** Union of all feature literals appearing in any plan. */
export type FeatureOf<P> = P extends PlansConfig<infer I>
  ? I[keyof I]['features'][number]
  : never;
