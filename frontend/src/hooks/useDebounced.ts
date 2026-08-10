"use client";

import { useEffect, useState } from "react";

/**
 * Delay a fast-changing value.
 *
 * The search box is the reason this exists: typing "starbucks" would otherwise
 * fire nine requests, and the ninth is the only one anyone wants. Debouncing the
 * value rather than the request keeps the input itself fully controlled and
 * responsive - the character appears immediately, only the fetch waits.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
