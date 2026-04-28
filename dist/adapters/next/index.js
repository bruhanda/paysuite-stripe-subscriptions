// src/errors/codes.ts
var ErrorCodes = {
  INVALID_SIGNATURE_FORMAT: "INVALID_SIGNATURE_FORMAT",
  SIGNATURE_TIMESTAMP_TOO_OLD: "SIGNATURE_TIMESTAMP_TOO_OLD",
  SIGNATURE_TIMESTAMP_IN_FUTURE: "SIGNATURE_TIMESTAMP_IN_FUTURE",
  SIGNATURE_MISMATCH: "SIGNATURE_MISMATCH",
  MISSING_SECRET: "MISSING_SECRET",
  MALFORMED_PAYLOAD: "MALFORMED_PAYLOAD"};

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
var SignatureVerificationError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "SignatureVerificationError";
  }
};
var ConfigError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "ConfigError";
  }
};

// src/idempotency/ttl.ts
var DEFAULT_COMMIT_TTL_SECONDS = 7 * 24 * 60 * 60;
var DEFAULT_CLAIM_TTL_SECONDS = 60;

// src/idempotency/guard.ts
async function withIdempotency(store, key, fn, opts = {}) {
  const claimTtlSeconds = opts.claimTtlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;
  const commitTtlSeconds = opts.commitTtlSeconds ?? DEFAULT_COMMIT_TTL_SECONDS;
  const state = await store.claim(key, { claimTtlSeconds });
  if (state === "committed") return { ran: false, reason: "duplicate" };
  if (state === "in-flight") return { ran: false, reason: "in-flight" };
  let value;
  try {
    value = await fn();
  } catch (error) {
    try {
      await store.release(key);
    } catch {
    }
    throw error;
  }
  await store.commit(key, { commitTtlSeconds });
  return { ran: true, value };
}

// src/idempotency/store.ts
function createMemoryStore(opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const map = /* @__PURE__ */ new Map();
  const purgeIfExpired = (key) => {
    const entry = map.get(key);
    if (entry !== void 0 && entry.expiresAtMs <= now()) {
      map.delete(key);
    }
  };
  return {
    async claim(key, { claimTtlSeconds }) {
      purgeIfExpired(key);
      const existing = map.get(key);
      if (existing !== void 0) {
        return existing.state === "committed" ? "committed" : "in-flight";
      }
      map.set(key, { state: "claimed", expiresAtMs: now() + claimTtlSeconds * 1e3 });
      return "claimed";
    },
    async commit(key, { commitTtlSeconds }) {
      map.set(key, { state: "committed", expiresAtMs: now() + commitTtlSeconds * 1e3 });
    },
    async release(key) {
      const existing = map.get(key);
      if (existing !== void 0 && existing.state === "claimed") {
        map.delete(key);
      }
    },
    async delete(key) {
      map.delete(key);
    }
  };
}

// src/core/encoding.ts
var encoder = /* @__PURE__ */ new TextEncoder();
var encodeUtf8 = (text) => encoder.encode(text);
var fromHex = (hex) => {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string: odd length.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex string: non-hex character.");
    }
    out[i] = byte;
  }
  return out;
};
var concatBytes = (...arrays) => {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

// src/core/crypto.ts
async function hmacSha256(key, data) {
  const keyBytes = typeof key === "string" ? encodeUtf8(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    // Cast: TS 5.7 typed `Uint8Array` as generic over `ArrayBufferLike`,
    // while `BufferSource` requires the more specific `ArrayBuffer`. The
    // values we pass at runtime are always backed by `ArrayBuffer` — this
    // cast bridges the lib mismatch without weakening the public API.
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}
function timingSafeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// src/core/time.ts
var systemClock = () => Date.now();

// src/webhooks/headers.ts
function parseSignatureHeader(header) {
  if (header.length === 0) return null;
  let timestamp = null;
  const v1Signatures = [];
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) return null;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
      timestamp = n;
    } else if (key === "v1") {
      if (value.length === 0) return null;
      v1Signatures.push(value);
    }
  }
  if (timestamp === null) return null;
  if (v1Signatures.length === 0) return null;
  return { timestamp, v1Signatures };
}

// src/webhooks/verifier.ts
var DEFAULT_TOLERANCE_SECONDS = 300;
var MAX_PAYLOAD_BYTES = 1048576;
async function verifyStripeSignature(opts) {
  if (typeof opts.secret !== "string" || !opts.secret.startsWith("whsec_")) {
    throw new ConfigError({
      code: ErrorCodes.MISSING_SECRET,
      message: "A whsec_-prefixed Stripe webhook secret is required."
    });
  }
  if (opts.header.length === 0) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.INVALID_SIGNATURE_FORMAT,
        message: "Stripe-Signature header is empty."
      })
    };
  }
  const parsed = parseSignatureHeader(opts.header);
  if (parsed === null) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.INVALID_SIGNATURE_FORMAT,
        message: "Stripe-Signature header is malformed."
      })
    };
  }
  const payloadBytes = opts.payload instanceof Uint8Array ? opts.payload : new Uint8Array(opts.payload);
  if (payloadBytes.byteLength === 0) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: "Webhook payload is empty."
      })
    };
  }
  if (payloadBytes.byteLength > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: `Webhook payload exceeds maximum allowed size (${MAX_PAYLOAD_BYTES} bytes).`
      })
    };
  }
  const nowMs = (opts.now ?? systemClock)();
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  const ageSeconds = Math.floor(nowMs / 1e3) - parsed.timestamp;
  if (ageSeconds > tolerance) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_TIMESTAMP_TOO_OLD,
        message: `Stripe-Signature timestamp is older than ${tolerance}s.`,
        details: { timestamp: parsed.timestamp, nowMs, tolerance }
      })
    };
  }
  if (ageSeconds < -tolerance) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_TIMESTAMP_IN_FUTURE,
        message: `Stripe-Signature timestamp is more than ${tolerance}s in the future.`,
        details: { timestamp: parsed.timestamp, nowMs, tolerance }
      })
    };
  }
  const tsPrefix = encodeUtf8(`${parsed.timestamp}.`);
  const signedPayload = concatBytes(tsPrefix, payloadBytes);
  const expectedMac = await hmacSha256(opts.secret, signedPayload);
  let matched = false;
  for (const candidateHex of parsed.v1Signatures) {
    let candidate;
    try {
      candidate = fromHex(candidateHex);
    } catch {
      continue;
    }
    if (timingSafeEqual(expectedMac, candidate)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_MISMATCH,
        message: "Computed signature did not match any v1 signature in the header."
      })
    };
  }
  let event;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
    event = JSON.parse(text);
  } catch (cause) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: "Verified payload is not valid UTF-8 JSON.",
        cause
      })
    };
  }
  return { ok: true, event, receivedAt: nowMs };
}

// src/webhooks/handler.ts
function createWebhookHandler(opts) {
  if (typeof opts.secret !== "string" || !opts.secret.startsWith("whsec_")) {
    throw new ConfigError({
      code: ErrorCodes.MISSING_SECRET,
      message: "createWebhookHandler requires a whsec_-prefixed Stripe webhook secret."
    });
  }
  const store = opts.store ?? createMemoryStore();
  const claimTtlSeconds = opts.claimTtl ?? DEFAULT_CLAIM_TTL_SECONDS;
  const commitTtlSeconds = opts.commitTtl ?? DEFAULT_COMMIT_TTL_SECONDS;
  const tolerance = opts.tolerance;
  const dispatcher = opts.dispatcher;
  const logger = opts.logger;
  return async function webhookHandler(request) {
    const headerValue = request.headers.get("stripe-signature");
    if (headerValue === null) {
      return plainText(400, "Missing Stripe-Signature header.");
    }
    let payload;
    try {
      payload = await request.arrayBuffer();
    } catch (cause) {
      logger?.warn("failed to read webhook request body", {
        cause: cause instanceof Error ? cause.message : String(cause)
      });
      return plainText(400, "Failed to read webhook request body.");
    }
    const verifyOpts = {
      payload,
      header: headerValue,
      secret: opts.secret
    };
    if (tolerance !== void 0) verifyOpts.tolerance = tolerance;
    const verifyResult = await verifyStripeSignature(verifyOpts);
    if (!verifyResult.ok) {
      logger?.warn("webhook signature verification failed", verifyResult.error.toJSON());
      return plainText(400, verifyResult.error.message);
    }
    const event = verifyResult.event;
    const idempotencyKey = `stripe:event:${event.id}`;
    try {
      const result = await withIdempotency(
        store,
        idempotencyKey,
        async () => {
          await dispatcher.dispatch(event);
        },
        { claimTtlSeconds, commitTtlSeconds }
      );
      if (!result.ran) {
        if (result.reason === "duplicate") {
          safeCall(opts.onDuplicate, event.id);
          return plainText(200, "Duplicate event \u2014 already committed.");
        }
        safeCall(opts.onInFlight, event.id);
        return plainText(425, "Event already in-flight on another worker.");
      }
      return plainText(200, "OK");
    } catch (error) {
      if (opts.onError !== void 0) {
        try {
          opts.onError(error, event);
        } catch (hookError) {
          logger?.error("onError hook threw", {
            hookError: hookError instanceof Error ? hookError.message : String(hookError)
          });
        }
      }
      logger?.error("webhook handler failed", {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error)
      });
      return plainText(500, "Handler failed; Stripe will retry.");
    }
  };
}
function plainText(status, body) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}
function safeCall(fn, eventId) {
  if (fn === void 0) return;
  try {
    fn(eventId);
  } catch {
  }
}

// src/adapters/next/app-router.ts
function createNextRouteHandler(opts) {
  return { POST: createWebhookHandler(opts) };
}

// src/adapters/_node-bridge.ts
function readNodeBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      let total = 0;
      for (const c of chunks) total += c.length;
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      resolve(out);
    });
    req.on("error", reject);
  });
}
function buildWebRequest(req, body, baseUrl = "http://localhost") {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(","));
    else if (typeof value === "string") headers.set(name, value);
  }
  return new Request(new URL(req.url ?? "/", baseUrl), {
    method: req.method ?? "POST",
    headers,
    // Cast: see `core/crypto.ts` — TS 5.7's generic `Uint8Array` is not
    // structurally assignable to `BodyInit`'s `ArrayBufferView<ArrayBuffer>`.
    body
  });
}
async function writeNodeResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  const body = new Uint8Array(await response.arrayBuffer());
  res.end(body);
}

// src/adapters/next/pages-router.ts
function createNextApiHandler(opts) {
  const handler = createWebhookHandler(opts);
  return async (req, res) => {
    const body = await readNodeBody(req);
    const webReq = buildWebRequest(req, body);
    const webRes = await handler(webReq);
    await writeNodeResponse(webRes, res);
  };
}
var config = { api: { bodyParser: false } };

export { config, createNextApiHandler, createNextRouteHandler };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map