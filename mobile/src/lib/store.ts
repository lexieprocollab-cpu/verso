import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

// A small persisted value on the phone (AsyncStorage), read by React with
// useSyncExternalStore, like the web app's localStorage stores.
export type Store<T> = { get(): T; set(value: T): void; useValue(): T; loaded: Promise<void> };

export function createStore<T>(key: string, initial: T, isValid: (value: unknown) => value is T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const loaded = AsyncStorage.getItem(key)
    .then((raw) => {
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) {
        value = parsed;
        notify();
      }
    })
    .catch(() => {});

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  return {
    get: () => value,
    set: (next) => {
      value = next;
      notify();
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
    },
    useValue: () => useSyncExternalStore(subscribe, () => value, () => initial),
    loaded,
  };
}
