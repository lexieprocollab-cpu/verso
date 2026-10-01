"use client";

import { useEffect, useState } from "react";
import type { RoomError, RoomsBackend } from "@/lib/rooms/backend";
import { createCloudRooms } from "@/lib/rooms/cloud";
import { createDeviceRooms } from "@/lib/rooms/device";
import { createLocalStore, parseJson } from "@/lib/localStore";
import type { Dictionary } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { useHydrated } from "../useSongs";

let backend: RoomsBackend | undefined;

function safeStorage(kind: "localStorage" | "sessionStorage"): Pick<Storage, "getItem" | "setItem"> {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => {
      try {
        return window[kind].getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem: (key, value) => {
      memory.set(key, value);
      try {
        window[kind].setItem(key, value);
      } catch {
        // Kept in memory for this visit.
      }
    },
  };
}

/** Cloud rooms once Supabase is configured; otherwise the device demo. */
function getRoomsBackend(): RoomsBackend {
  if (backend) return backend;
  const db = getSupabase();
  backend = db
    ? createCloudRooms(db)
    : createDeviceRooms({
        storage: safeStorage("localStorage"),
        session: safeStorage("sessionStorage"),
        channel: typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("verso.rooms"),
        openChannel: typeof BroadcastChannel === "undefined" ? undefined : (name) => new BroadcastChannel(name),
      });
  return backend;
}

/** The rooms backend in the browser; null during server render. */
export function useRoomsBackend(): RoomsBackend | null {
  return useHydrated() ? getRoomsBackend() : null;
}

/**
 * Loads `load()` and reloads it whenever `subscribe` reports a change (or a
 * dependency changes). Undefined until the first load finishes.
 */
export function useLive<T>(
  load: (() => Promise<T>) | null,
  subscribe: ((onChange: () => void) => () => void) | null,
  deps: unknown[],
): [T | undefined, () => void] {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!load) return;
    let live = true;
    const run = () => void load().then((next) => live && setValue(next));
    run();
    const stop = subscribe?.(run);
    return () => {
      live = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, Boolean(load)]);
  return [value, () => setVersion((v) => v + 1)];
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string");

/** People muted on this device: their messages are hidden only for you. */
export const mutedStore = createLocalStore<string[]>("verso.rooms.muted", [], (raw) => parseJson(raw, [], isStringArray));

/** Set once someone enters a birth date under 13, so the age gate can't be retried. */
export const ageLockStore = createLocalStore<boolean>("verso.rooms.ageLock", false, (raw) => raw === "true", String);

export function errorText(t: Dictionary, error: RoomError, outside: string[] = []): string {
  switch (error) {
    case "outside_words":
      return t.rooms.outside.replace("{words}", outside.join(", "));
    case "blocked_word":
      return t.rooms.blocked;
    case "too_long":
      return t.rooms.tooLong;
    case "slow_down":
      return t.rooms.slowDown;
    case "banned":
      return t.rooms.banned;
    case "too_young":
      return t.rooms.tooYoung;
    case "profile_needed":
      return t.rooms.profileNeeded;
    case "sign_in_required":
      return t.rooms.signIn;
    case "follow_needed":
      return t.buddies.followNeeded;
    case "blocked":
      return t.buddies.blocked;
    case "not_allowed":
      return t.buddies.notAllowed;
    default:
      return t.ai.failed;
  }
}
