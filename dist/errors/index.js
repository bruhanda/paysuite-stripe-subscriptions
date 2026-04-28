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

// src/errors/codes.ts
var ErrorCodes = {
  INVALID_SIGNATURE_FORMAT: "INVALID_SIGNATURE_FORMAT",
  SIGNATURE_TIMESTAMP_TOO_OLD: "SIGNATURE_TIMESTAMP_TOO_OLD",
  SIGNATURE_TIMESTAMP_IN_FUTURE: "SIGNATURE_TIMESTAMP_IN_FUTURE",
  SIGNATURE_MISMATCH: "SIGNATURE_MISMATCH",
  MISSING_SECRET: "MISSING_SECRET",
  MALFORMED_PAYLOAD: "MALFORMED_PAYLOAD",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  UNKNOWN_PRICE_ID: "UNKNOWN_PRICE_ID",
  STORE_UNAVAILABLE: "STORE_UNAVAILABLE",
  HANDLER_FAILED: "HANDLER_FAILED",
  CONFIG_INVALID: "CONFIG_INVALID"
};

// src/errors/index.ts
var SignatureVerificationError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "SignatureVerificationError";
  }
};
var InvalidTransitionError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "InvalidTransitionError";
  }
};
var ConfigError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "ConfigError";
  }
};
var StoreError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "StoreError";
  }
};
var HandlerError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "HandlerError";
  }
};

export { ConfigError, ErrorCodes, HandlerError, InvalidTransitionError, PaySuiteError, SignatureVerificationError, StoreError };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map