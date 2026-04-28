/**
 * Internal Node ↔ Web bridge used by Pages-Router, Express, and Fastify
 * adapters. NOT exposed via package exports. Lets the rest of the library
 * stay on Web `Request`/`Response` while accommodating frameworks that
 * still pass Node-style `IncomingMessage`/`ServerResponse` pairs.
 */
/** Minimal Node IncomingMessage-like shape we need. */
interface NodeRequestLike {
    method?: string | undefined;
    url?: string | undefined;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', listener: (chunk: Uint8Array) => void): void;
    on(event: 'end', listener: () => void): void;
    on(event: 'error', listener: (err: Error) => void): void;
}
/** Minimal Node ServerResponse-like shape we write to. */
interface NodeResponseLike {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Uint8Array): void;
}

export type { NodeRequestLike as N, NodeResponseLike as a };
