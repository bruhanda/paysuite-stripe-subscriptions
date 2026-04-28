// src/plans/define.ts
function definePlans(plans) {
  return plans;
}

// src/errors/codes.ts
var ErrorCodes = {
  UNKNOWN_PRICE_ID: "UNKNOWN_PRICE_ID"};

// src/errors/base.ts
var PaySuiteError = class extends Error {
  /** Stable programmatic code — see {@link ErrorCode}. */
  code;
  /** Frozen structured context attached at throw site (when provided). */
  details;
  constructor(opts) {
    super(opts.message);
    this.name = "PaySuiteError";
    this.code = opts.code;
    if (opts.details !== void 0) {
      this.details = Object.freeze({ ...opts.details });
    }
    if (opts.cause !== void 0) {
      this.cause = opts.cause;
    }
  }
  /**
   * Produce a JSON-serializable snapshot of this error. Recursive `cause`
   * values that are themselves errors are flattened to a `{ name, message }`
   * pair so circular references (e.g. AggregateError) stay safe to log.
   *
   * @returns A serializable object suitable for `JSON.stringify`.
   */
  toJSON() {
    const base = {
      name: this.name,
      code: this.code,
      message: this.message
    };
    if (this.details !== void 0) base.details = this.details;
    if (this.cause !== void 0) base.cause = serializeCause(this.cause);
    return base;
  }
};
function serializeCause(cause) {
  if (cause instanceof PaySuiteError) return cause.toJSON();
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  return cause;
}

// src/errors/index.ts
var ConfigError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "ConfigError";
  }
};

// src/plans/resolve.ts
function resolveFeatures(plans, priceId) {
  const entries = plans;
  for (const planName of Object.keys(entries)) {
    const plan = entries[planName];
    if (plan === void 0) continue;
    if (plan.priceId === priceId) {
      return plan.features;
    }
  }
  return null;
}
function hasFeature(plans, priceId, feature) {
  const features = resolveFeatures(plans, priceId);
  if (features === null) {
    throw new ConfigError({
      code: ErrorCodes.UNKNOWN_PRICE_ID,
      message: `Unknown price id: ${String(priceId)}`,
      details: { priceId: String(priceId) }
    });
  }
  return features.includes(feature);
}
function isFeatureEnabled(plans, priceId, feature) {
  const features = resolveFeatures(plans, priceId);
  if (features === null) return null;
  return features.includes(feature);
}

export { definePlans, hasFeature, isFeatureEnabled, resolveFeatures };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map