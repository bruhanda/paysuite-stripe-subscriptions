/**
 * Shape constraint accepted by {@link definePlans}. Every plan declares a
 * Stripe price id and a list of feature literals that membership grants.
 *
 * The `readonly` qualifier on `features` is load-bearing: it preserves
 * literal types when the caller passes the object with `as const`, which
 * is what unlocks `FeatureOf<typeof plans>` inference.
 */
type PlanConfigInput = {
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
type PlansConfig<P extends PlanConfigInput> = P & {
    readonly __brand: 'PlansConfig';
};
/** Union of all plan names declared in `definePlans`. */
type PlanNameOf<P> = P extends PlansConfig<infer I> ? Extract<keyof I, string> : never;
/** Union of all `priceId` literals declared in `definePlans`. */
type PriceIdOf<P> = P extends PlansConfig<infer I> ? I[keyof I]['priceId'] : never;
/** Union of all feature literals appearing in any plan. */
type FeatureOf<P> = P extends PlansConfig<infer I> ? I[keyof I]['features'][number] : never;

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
declare function definePlans<const P extends PlanConfigInput>(plans: P): PlansConfig<P>;

/**
 * Resolve a Stripe price id to its declared (typed, immutable) feature list.
 * Returns `null` when the price id is not declared — narrow before use.
 *
 * The `(string & {})` widening on the parameter lets you pass a raw string
 * (e.g. from a database row) without a type cast, while still enabling
 * literal autocomplete when you pass a known plan's price id directly.
 *
 * @param plans   - The {@link PlansConfig} produced by {@link definePlans}.
 * @param priceId - The Stripe price id to look up.
 * @returns The matching plan's feature array, or `null` if no match.
 *
 * @example
 * ```ts
 * const features = resolveFeatures(plans, sub.priceId);
 * if (features !== null) renderFeatures(features);
 * ```
 */
declare function resolveFeatures<P extends PlansConfig<PlanConfigInput>>(plans: P, priceId: PriceIdOf<P> | (string & {})): ReadonlyArray<FeatureOf<P>> | null;
/**
 * **Asserting** feature check — assumes `priceId` is a known plan price.
 * Throws `ConfigError(UNKNOWN_PRICE_ID)` for unknown ids. Use this on the
 * inside of trusted code paths where the price id originates from your own
 * plan config or a verified webhook event.
 *
 * Split from {@link isFeatureEnabled} (which returns `null` for unknown
 * ids) so the two distinct outcomes — *unknown price* vs *feature disabled*
 * — are never collapsed into the same `false`.
 *
 * @param plans   - The {@link PlansConfig} produced by {@link definePlans}.
 * @param priceId - The price id (must be one of the declared prices).
 * @param feature - The feature literal to check.
 * @returns `true` if the plan grants the feature, `false` otherwise.
 * @throws {ConfigError} With code `UNKNOWN_PRICE_ID` when the price id is
 *         not declared in `plans`.
 */
declare function hasFeature<P extends PlansConfig<PlanConfigInput>>(plans: P, priceId: PriceIdOf<P>, feature: FeatureOf<P>): boolean;
/**
 * **Tolerant** feature check — designed for runtime input (URLs, untrusted
 * DB rows). Returns `true` / `false` for known prices and `null` for
 * unknown ones, so callers explicitly choose how to treat unknown ids
 * (log, default, deny).
 *
 * @param plans   - The {@link PlansConfig} produced by {@link definePlans}.
 * @param priceId - Any string price id.
 * @param feature - The feature literal to check.
 * @returns `true` (granted), `false` (declared but not granted), or `null`
 *          (unknown price id).
 */
declare function isFeatureEnabled<P extends PlansConfig<PlanConfigInput>>(plans: P, priceId: string, feature: FeatureOf<P>): boolean | null;

export { type FeatureOf, type PlanConfigInput, type PlanNameOf, type PlansConfig, type PriceIdOf, definePlans, hasFeature, isFeatureEnabled, resolveFeatures };
