import type Stripe from 'stripe';
import { type Result, err, ok } from '../core/result.js';
import { ErrorCodes } from '../errors/codes.js';
import { PaySuiteError } from '../errors/index.js';

/**
 * Parse a raw webhook payload (bytes or string) into a typed `Stripe.Event`.
 * Performs structural validation — `id`, `type`, and `data.object` must be
 * present — before returning. Callers that have already verified the
 * Stripe signature can trust the typed result.
 *
 * @param rawPayload - The verified raw payload, as bytes or a UTF-8 string.
 * @returns `Ok<Stripe.Event>` on success; `Err<PaySuiteError>` for invalid
 *          UTF-8, invalid JSON, or a JSON value that is not shaped like a
 *          Stripe event.
 *
 * @example
 * ```ts
 * const r = parseEvent(await request.arrayBuffer());
 * if (r.ok) console.log(r.value.type);
 * ```
 */
export function parseEvent(
  rawPayload: string | Uint8Array | ArrayBuffer,
): Result<Stripe.Event, PaySuiteError> {
  let text: string;
  if (typeof rawPayload === 'string') {
    text = rawPayload;
  } else {
    const bytes = rawPayload instanceof Uint8Array ? rawPayload : new Uint8Array(rawPayload);
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (cause) {
      return err(
        new PaySuiteError({
          code: ErrorCodes.MALFORMED_PAYLOAD,
          message: 'Payload is not valid UTF-8.',
          cause,
        }),
      );
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return err(
      new PaySuiteError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: 'Payload is not valid JSON.',
        cause,
      }),
    );
  }

  if (!isStripeEventShape(parsed)) {
    return err(
      new PaySuiteError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: 'Payload does not match Stripe event shape.',
      }),
    );
  }

  // Cast: structural shape check above proves the `id`/`type`/`data.object`
  // triple is present. The full Stripe.Event union has many additional
  // optional fields we deliberately don't spot-check; trusting the verified
  // bytes is the contract documented at the call site.
  return ok(parsed as unknown as Stripe.Event);
}

function isStripeEventShape(
  v: unknown,
): v is { id: string; type: string; data: { object: unknown } } {
  if (typeof v !== 'object' || v === null) return false;
  if (!('id' in v) || typeof v.id !== 'string') return false;
  if (!('type' in v) || typeof v.type !== 'string') return false;
  if (!('data' in v) || typeof v.data !== 'object' || v.data === null) return false;
  if (!('object' in v.data)) return false;
  return true;
}
