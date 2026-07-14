'use client';

// use-api.ts — a small data hook with loading/error/retry states over apiGet.
// Keeps every page's fetch behaviour identical and testable.

import { useCallback, useEffect, useState } from 'react';
import { type z } from 'zod';
import { type ClientResult, apiGet } from './api-client';

/** The state a page renders from. */
export interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/** Fetch `path`, validate with `schema`, re-run when `deps` change. */
export function useApi<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  deps: readonly unknown[] = [],
): ApiState<z.infer<S>> {
  const [data, setData] = useState<z.infer<S> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void apiGet(path, schema).then((result: ClientResult<z.infer<S>>) => {
      if (cancelled) return;
      if (result.ok) {
        setData(result.value);
      } else {
        setError(result.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [path, nonce, schema, ...deps]);

  return { data, loading, error, reload };
}
