"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, isAbort } from "@/lib/api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  /** True only on the first load, when there is nothing to show yet. */
  loading: boolean;
  /** True on every refetch, including ones that keep the old data on screen. */
  refreshing: boolean;
}

/**
 * Run an async fetch tied to a dependency key, with three behaviours the table
 * depends on:
 *
 *  1. Aborts the in-flight request when the key changes. Without this, a slow
 *     response for "star" can land after a fast one for "starbucks" and
 *     overwrite it - the classic out-of-order render.
 *  2. Guards with a sequence number as well as the abort, because an abort only
 *     covers the network; a response already parsed and queued as a microtask
 *     can still resolve after a newer one.
 *  3. Keeps the previous data visible while refetching. Blanking the table on
 *     every filter change makes the page jump and reads as slower than it is.
 *
 * Written by hand rather than pulled from a data library so the request
 * lifecycle is explicit and inspectable - see DECISIONS.md for the tradeoff.
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });

  const [nonce, setNonce] = useState(0);
  const sequence = useRef(0);
  // Held in a ref so changing the fetcher identity every render (it closes over
  // filters) does not itself retrigger the effect. `key` is the only trigger.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    const mySequence = ++sequence.current;

    setState((prev) => ({
      ...prev,
      loading: prev.data === null,
      refreshing: true,
      error: null,
    }));

    fetcherRef.current(controller.signal)
      .then((data) => {
        if (mySequence !== sequence.current) return;
        setState({ data, error: null, loading: false, refreshing: false });
      })
      .catch((error: unknown) => {
        // A cancelled request is expected, not a failure. Rendering an error here
        // would flash a message on every keystroke.
        if (isAbort(error) || mySequence !== sequence.current) return;
        setState((prev) => ({
          data: prev.data,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, "unknown_error", "Something went wrong."),
          loading: false,
          refreshing: false,
        }));
      });

    return () => controller.abort();
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
}
