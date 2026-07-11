/**
 * Keeps an idempotency key for exactly one logical mutation. A network timeout
 * is ambiguous: the server may have committed the request, so a retry must
 * reuse the key. Editing the payload starts a new operation and gets a new key.
 */
export interface PendingIdempotencyKey {
  fingerprint: string;
  key: string;
}

export function retainIdempotencyKey(
  pending: PendingIdempotencyKey | null,
  fingerprint: string,
  createKey: () => string,
): PendingIdempotencyKey {
  if (pending?.fingerprint === fingerprint) return pending;
  return { fingerprint, key: createKey() };
}
