import { retainIdempotencyKey, type PendingIdempotencyKey } from "./idempotency";

interface SubmitIdempotentMutation<T> {
  fingerprint: string;
  post: (idempotencyKey: string) => Promise<T>;
  /** Refreshing client state is best effort after the server confirms success. */
  refresh?: () => Promise<unknown>;
}

/**
 * Mutation orchestration boundary for requests where a lost response is
 * indistinguishable from a failed request. It owns the pending key rather than
 * leaving retry semantics spread between form submit handlers.
 */
export class IdempotentMutation {
  private pending: PendingIdempotencyKey | null = null;

  constructor(private readonly createKey: () => string) {}

  async submit<T>({ fingerprint, post, refresh }: SubmitIdempotentMutation<T>): Promise<T> {
    const operation = retainIdempotencyKey(this.pending, fingerprint, this.createKey);
    this.pending = operation;

    try {
      const result = await post(operation.key);
      // A resolved POST confirms the backend has accepted the logical operation.
      // Clear before refresh: cache refresh failure must not make it retryable.
      this.pending = null;
      await refresh?.().catch(() => undefined);
      return result;
    } catch (error) {
      // Preserve the operation for a byte-for-byte retry after any ambiguous
      // client/network failure. A changed fingerprint deliberately starts anew.
      throw error;
    }
  }
}
