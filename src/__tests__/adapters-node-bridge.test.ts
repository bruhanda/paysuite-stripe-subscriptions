import { describe, expect, it } from 'vitest';
import {
  type NodeRequestLike,
  type NodeResponseLike,
  buildWebRequest,
  readNodeBody,
  writeNodeResponse,
} from '../adapters/_node-bridge.js';

const fakeIncomingRequest = (
  body: Uint8Array,
  opts: {
    headers?: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
    error?: Error;
  } = {},
): NodeRequestLike => {
  const listeners = {
    data: [] as Array<(c: Uint8Array) => void>,
    end: [] as Array<() => void>,
    error: [] as Array<(e: Error) => void>,
  };
  const req: NodeRequestLike = {
    method: opts.method ?? 'POST',
    url: opts.url ?? '/wh',
    headers: opts.headers ?? {},
    on(event: 'data' | 'end' | 'error', listener: never) {
      // Cast: each branch's listener type is a subset of Function.
      listeners[event].push(listener as never);
    },
  };
  // Fire data + end on next tick so that the readNodeBody listener registration completes first.
  queueMicrotask(() => {
    if (opts.error !== undefined) {
      for (const l of listeners.error) l(opts.error);
      return;
    }
    for (const l of listeners.data) l(body);
    for (const l of listeners.end) l();
  });
  return req;
};

describe('adapters/_node-bridge', () => {
  describe('readNodeBody', () => {
    it('should accumulate streamed chunks into a single Uint8Array when called', async () => {
      const req = fakeIncomingRequest(new Uint8Array([1, 2, 3]));
      const result = await readNodeBody(req);
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('should resolve to an empty Uint8Array when no data is streamed', async () => {
      const req = fakeIncomingRequest(new Uint8Array());
      const result = await readNodeBody(req);
      expect(result.length).toBe(0);
    });

    it('should reject when the underlying stream emits an error', async () => {
      const error = new Error('stream broken');
      const req = fakeIncomingRequest(new Uint8Array(), { error });
      await expect(readNodeBody(req)).rejects.toThrow('stream broken');
    });
  });

  describe('buildWebRequest', () => {
    it('should propagate string headers when constructing the Web Request', () => {
      const node = {
        method: 'POST',
        url: '/wh',
        headers: { 'stripe-signature': 't=1,v1=ff', 'x-other': 'x' },
        on() {},
      } as unknown as NodeRequestLike;
      const req = buildWebRequest(node, new Uint8Array([1, 2]));
      expect(req.headers.get('stripe-signature')).toBe('t=1,v1=ff');
      expect(req.headers.get('x-other')).toBe('x');
    });

    it('should join array-valued headers with comma when constructing', () => {
      const node = {
        method: 'POST',
        url: '/wh',
        headers: { 'x-multi': ['a', 'b'] },
        on() {},
      } as unknown as NodeRequestLike;
      const req = buildWebRequest(node, new Uint8Array([0]));
      expect(req.headers.get('x-multi')).toBe('a,b');
    });

    it('should ignore undefined-valued headers when constructing', () => {
      const node = {
        method: 'POST',
        url: '/wh',
        headers: { 'x-undef': undefined },
        on() {},
      } as unknown as NodeRequestLike;
      const req = buildWebRequest(node, new Uint8Array([0]));
      expect(req.headers.get('x-undef')).toBeNull();
    });

    it('should default method to POST and url to / when missing', () => {
      const node = {
        headers: {},
        on() {},
      } as unknown as NodeRequestLike;
      const req = buildWebRequest(node, new Uint8Array([1]));
      expect(req.method).toBe('POST');
      expect(new URL(req.url).pathname).toBe('/');
    });

    it('should attach the body bytes to the Web Request when constructed', async () => {
      const node = {
        method: 'POST',
        url: '/x',
        headers: {},
        on() {},
      } as unknown as NodeRequestLike;
      const req = buildWebRequest(node, new Uint8Array([7, 8, 9]));
      const ab = await req.arrayBuffer();
      expect(Array.from(new Uint8Array(ab))).toEqual([7, 8, 9]);
    });
  });

  describe('writeNodeResponse', () => {
    it('should mirror Web Response status, headers and body to the Node response when called', async () => {
      const headers: Record<string, string> = {};
      let body: Uint8Array | string | undefined;
      let statusCode = 200;
      const res: NodeResponseLike = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(value: number) {
          statusCode = value;
        },
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        end(b?: string | Uint8Array) {
          body = b;
        },
      };
      const webRes = new Response('hello', {
        status: 418,
        headers: { 'content-type': 'text/plain' },
      });
      await writeNodeResponse(webRes, res);
      expect(statusCode).toBe(418);
      expect(headers['content-type']).toMatch(/text\/plain/);
      expect(typeof body).not.toBe('undefined');
      expect(new TextDecoder().decode(body as Uint8Array)).toBe('hello');
    });
  });
});
