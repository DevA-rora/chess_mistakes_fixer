"use client";

import { useEffect, useState } from "react";

/**
 * Cross-hook signal used to invalidate every Supabase-backed store hook
 * after events that change persisted data outside of normal mutation
 * flow (e.g. the one-time localStorage migration).
 */

let revision = 0;
const listeners = new Set<() => void>();

export function getDataRevision(): number {
  return revision;
}

export function bumpDataRevision(): void {
  revision += 1;
  for (const cb of listeners) cb();
}

export function useDataRevision(): number {
  const [value, setValue] = useState<number>(revision);

  useEffect(() => {
    const cb = () => setValue(revision);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  return value;
}
