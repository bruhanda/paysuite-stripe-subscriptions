import { ErrorCodes } from '../errors/codes.js';
import { ConfigError } from '../errors/index.js';
import type {
  FeatureOf,
  PlanConfigInput,
  PlansConfig,
  PriceIdOf,
} from './types.js';

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
export function resolveFeatures<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: PriceIdOf<P> | (string & {}),
): ReadonlyArray<FeatureOf<P>> | null {
  // Cast: `PlansConfig<P>` is `P & { __brand }` — the brand is virtual, so
  // the runtime object is structurally a `PlanConfigInput`. The intersection
  // confuses TS's index-signature compatibility check, hence the cast.
  const entries = plans as unknown as PlanConfigInput;
  for (const planName of Object.keys(entries)) {
    const plan = entries[planName];
    if (plan === undefined) continue;
    if (plan.priceId === priceId) {
      // Cast: at the type level, `plan.features` widens through the index
      // access; the value flows back to the caller's instantiated `P` where
      // `FeatureOf<P>` is the precise union of literal feature names.
      return plan.features as ReadonlyArray<FeatureOf<P>>;
    }
  }
  return null;
}

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
export function hasFeature<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: PriceIdOf<P>,
  feature: FeatureOf<P>,
): boolean {
  const features = resolveFeatures(plans, priceId);
  if (features === null) {
    throw new ConfigError({
      code: ErrorCodes.UNKNOWN_PRICE_ID,
      message: `Unknown price id: ${String(priceId)}`,
      details: { priceId: String(priceId) },
    });
  }
  return features.includes(feature);
}

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
export function isFeatureEnabled<P extends PlansConfig<PlanConfigInput>>(
  plans: P,
  priceId: string,
  feature: FeatureOf<P>,
): boolean | null {
  const features = resolveFeatures(plans, priceId);
  if (features === null) return null;
  return features.includes(feature);
}
