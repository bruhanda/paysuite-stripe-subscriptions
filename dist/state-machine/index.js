// src/state-machine/status.ts
var SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused"
];

// src/core/result.ts
var ok = (value) => ({ ok: true, value });
var err = (error) => ({ ok: false, error });

// src/errors/codes.ts
var ErrorCodes = {
  INVALID_TRANSITION: "INVALID_TRANSITION"};

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
var InvalidTransitionError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "InvalidTransitionError";
  }
};

// src/state-machine/transitions.ts
var TRANSITIONS = {
  incomplete: ["active", "trialing", "incomplete_expired", "canceled"],
  incomplete_expired: [],
  trialing: ["active", "past_due", "canceled", "unpaid", "paused", "incomplete_expired"],
  active: ["past_due", "canceled", "unpaid", "paused", "trialing"],
  past_due: ["active", "canceled", "unpaid"],
  canceled: [],
  unpaid: ["active", "canceled", "past_due"],
  paused: ["active", "canceled", "trialing"]
};
var VALID_TRANSITIONS = TRANSITIONS;
function validateSubscriptionTransition(from, to) {
  if (from === to) return ok({ from, to });
  const allowed = VALID_TRANSITIONS[from];
  if (allowed.includes(to)) return ok({ from, to });
  return err(
    new InvalidTransitionError({
      code: ErrorCodes.INVALID_TRANSITION,
      message: `Transition ${from} \u2192 ${to} is not allowed.`,
      details: { from, to }
    })
  );
}

// src/state-machine/reducer.ts
function reduceSubscription(prev, event) {
  const sub = event.data.object;
  if (prev !== null && event.created < prev.updatedAt) {
    return prev;
  }
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    // Cast: `sub.status` is a Stripe-defined union we mirror in
    // `SubscriptionStatus`. Stripe may add new statuses in the future
    // (§9.3 #16 in PLAN.md); the cast preserves the raw value rather than
    // erroring, with the understanding that consumers branching on a closed
    // union will see TypeScript flag the new status when they upgrade.
    status: sub.status,
    priceId: extractPriceId(sub),
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: sub.trial_end,
    updatedAt: event.created
  };
}
function extractPriceId(sub) {
  const item = sub.items.data[0];
  if (item === void 0) return "";
  return item.price.id;
}

// src/state-machine/transition-router.ts
function createTransitionRouter() {
  const effects = /* @__PURE__ */ new Map();
  const key = (from, to) => `${from}\u2192${to}`;
  const router = {
    on(from, to, effect) {
      const k = key(from, to);
      const arr = effects.get(k) ?? [];
      arr.push(effect);
      effects.set(k, arr);
      return router;
    },
    async run(ctx) {
      const arr = effects.get(key(ctx.from, ctx.to));
      if (arr === void 0) return;
      for (const effect of arr) {
        await effect(ctx);
      }
    }
  };
  return router;
}

export { SUBSCRIPTION_STATUSES, VALID_TRANSITIONS, createTransitionRouter, reduceSubscription, validateSubscriptionTransition };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map