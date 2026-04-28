/**
 * Internal Node ↔ Web bridge used by Pages-Router, Express, and Fastify
 * adapters. NOT exposed via package exports. Lets the rest of the library
 * stay on Web `Request`/`Response` while accommodating frameworks that
 * still pass Node-style `IncomingMessage`/`ServerResponse` pairs.
 */

/** Minimal Node IncomingMessage-like shape we need. */
export interface NodeRequestLike {
  method?: string | undefined;
  url?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', listener: (chunk: Uint8Array) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** Minimal Node ServerResponse-like shape we write to. */
export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | Uint8Array): void;
}

/**
 * Read the raw body off an IncomingMessage-like stream into a single
 * `Uint8Array`. Avoids `Buffer` so the helper stays ESM-pure.
 *
 * @param req - The Node-style request.
 * @returns The complete request body.
 */
export function readNodeBody(req: NodeRequestLike): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => {
      // Node IncomingMessage emits `Buffer`s; `Buffer extends Uint8Array`,
      // so `Uint8Array` already covers the runtime shape.
      chunks.push(chunk);
    });
    req.on('end', () => {
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
    req.on('error', reject);
  });
}

/**
 * Build a Web `Request` from a Node-style request and a pre-read body.
 *
 * @param req     - The Node-style request — supplies method/url/headers.
 * @param body    - The pre-read raw body bytes.
 * @param baseUrl - Synthetic base URL — never read by the webhook handler.
 * @returns A Web-standard `Request`.
 */
export function buildWebRequest(
  req: NodeRequestLike,
  body: Uint8Array,
  baseUrl = 'http://localhost',
): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(','));
    else if (typeof value === 'string') headers.set(name, value);
  }
  return new Request(new URL(req.url ?? '/', baseUrl), {
    method: req.method ?? 'POST',
    headers,
    // Cast: see `core/crypto.ts` — TS 5.7's generic `Uint8Array` is not
    // structurally assignable to `BodyInit`'s `ArrayBufferView<ArrayBuffer>`.
    body: body as BodyInit,
  });
}

/**
 * Pipe a Web `Response` back through a Node-style response.
 *
 * @param response - The Web `Response` produced by the handler.
 * @param res      - The Node-style response to write to.
 */
export async function writeNodeResponse(
  response: Response,
  res: NodeResponseLike,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  const body = new Uint8Array(await response.arrayBuffer());
  res.end(body);
}
