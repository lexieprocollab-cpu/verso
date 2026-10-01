import { useSyncExternalStore } from "react";

// Small localStorage-backed stores that React reads with useSyncExternalStore.
// Changes re-render every subscriber, including other tabs. If storage is
// blocked (private mode), values live in memory for this visit only.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string) {
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

export type LocalStore<T> = {
  get: () => T;
  set: (value: T) => void;
  useValue: () => T;
};

/**
 * `parse` turns the stored string (or null) into a value; it must fall back to
 * `initial` for anything unexpected. Snapshots are cached per raw string so
 * React sees a stable reference until the stored value changes.
 */
export function createLocalStore<T>(
  key: string,
  initial: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string = (value) => JSON.stringify(value),
): LocalStore<T> {
  let lastRaw: string | null | undefined;
  let lastValue = initial;

  const get = () => {
    const raw = readRaw(key);
    if (raw !== lastRaw) {
      lastRaw = raw;
      lastValue = parse(raw);
    }
    return lastValue;
  };

  return {
    get,
    set: (value) => writeRaw(key, serialize(value)),
    useValue: () => useSyncExternalStore(subscribe, get, () => initial),
  };
}

/** Parses JSON, returning `fallback` for missing or malformed data. */
export function parseJson<T>(raw: string | null, fallback: T, isValid: (value: unknown) => value is T): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
