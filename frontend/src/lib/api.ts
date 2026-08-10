import type {
  Analytics,
  CoinBalance,
  Filters,
  FilterOptions,
  Redemption,
  Reward,
  SortField,
  SortOrder,
  Transaction,
  TransactionPage,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Errors the UI can act on.
 *
 * `code` comes from the backend's error body, so a component can branch on
 * "insufficient_coins" without parsing a message string. `aborted` is separated
 * out because a cancelled request is not a failure - it happens on every
 * keystroke of the search box and must never render an error state.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isConflict() {
    return this.status === 409;
  }

  get isOffline() {
    return this.status === 0;
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function request<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    // A network-level failure. Given a distinct code so the UI can say
    // "can't reach the server" rather than showing a bare 500.
    throw new ApiError(
      0,
      "network_error",
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // FastAPI nests HTTPException payloads under `detail`.
    const payload = (body?.detail ?? body ?? {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof payload.code === "string" ? payload.code : "unknown_error",
      typeof payload.message === "string"
        ? payload.message
        : "That didn't work. Try again.",
      payload,
    );
  }

  return body as T;
}

/** Only send params that are set, so the URL stays readable and cacheable. */
function toQuery(filters: Filters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.search.trim()) q.set("search", filters.search.trim());
  filters.categories.forEach((c) => q.append("category", c));
  filters.statuses.forEach((s) => q.append("status", s));
  filters.paymentMethods.forEach((m) => q.append("payment_method", m));
  if (filters.dateFrom) q.set("date_from", filters.dateFrom);
  if (filters.dateTo) q.set("date_to", filters.dateTo);
  if (filters.minAmount) q.set("min_amount", filters.minAmount);
  if (filters.maxAmount) q.set("max_amount", filters.maxAmount);
  if (filters.uncategorisedOnly) q.set("uncategorised_only", "true");
  if (filters.includeOutliers) q.set("include_outliers", "true");
  if (!filters.includeRefunds) q.set("include_refunds", "false");
  return q;
}

export const api = {
  transactions(
    filters: Filters,
    opts: {
      page: number;
      pageSize: number;
      sort: SortField;
      order: SortOrder;
      signal?: AbortSignal;
    },
  ): Promise<TransactionPage> {
    const q = toQuery(filters);
    q.set("page", String(opts.page));
    q.set("page_size", String(opts.pageSize));
    q.set("sort", opts.sort);
    q.set("order", opts.order);
    return request<TransactionPage>(`/api/transactions?${q}`, {
      signal: opts.signal,
    });
  },

  transaction(id: number, signal?: AbortSignal): Promise<Transaction> {
    return request<Transaction>(`/api/transactions/${id}`, { signal });
  },

  analytics(filters: Filters, signal?: AbortSignal): Promise<Analytics> {
    return request<Analytics>(`/api/analytics?${toQuery(filters)}`, { signal });
  },

  filterOptions(signal?: AbortSignal): Promise<FilterOptions> {
    return request<FilterOptions>("/api/filter-options", { signal });
  },

  balance(signal?: AbortSignal): Promise<CoinBalance> {
    return request<CoinBalance>("/api/coins/balance", { signal });
  },

  rewards(signal?: AbortSignal): Promise<Reward[]> {
    return request<Reward[]>("/api/rewards", { signal });
  },

  redeem(rewardId: number, idempotencyKey: string): Promise<Redemption> {
    return request<Redemption>("/api/redemptions", {
      method: "POST",
      body: JSON.stringify({
        reward_id: rewardId,
        idempotency_key: idempotencyKey,
      }),
    });
  },
};
