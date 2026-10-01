import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RoomError, RoomsBackend } from "@shared/lib/rooms/backend";
import { createCloudRooms } from "@shared/lib/rooms/cloud";
import { createDeviceRooms } from "@shared/lib/rooms/device";
import type { Dictionary } from "@shared/lib/i18n";
import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { getSupabase } from "./supabase";

// Song Rooms on the phone: the web app's cloud backend (Supabase + /api/rooms)
// when connected, else the same on-device demo the website uses.

const KEYS = ["verso.rooms.world", "verso.rooms.me"];
const memory = new Map<string, string>();
export const roomsReady: Promise<void> = AsyncStorage.multiGet(KEYS)
  .then((pairs) => pairs.forEach(([key, value]) => value !== null && memory.set(key, value)))
  .catch(() => {});

let backend: RoomsBackend | undefined;
export function getRooms(): RoomsBackend {
  if (backend) return backend;
  const db = getSupabase();
  backend = db
    ? createCloudRooms(db, API_URL)
    : createDeviceRooms({
        storage: {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => {
            memory.set(key, value);
            AsyncStorage.setItem(key, value).catch(() => {});
          },
        },
      });
  return backend;
}

/** Loads `load()` and reloads when `subscribe` reports a change (or deps change). */
export function useLive<T>(load: () => Promise<T>, subscribe: ((onChange: () => void) => () => void) | null, deps: unknown[]): [T | undefined, () => void] {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    const run = () => void roomsReady.then(load).then((next) => live && setValue(next));
    run();
    const stop = subscribe?.(run);
    return () => {
      live = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return [value, () => setVersion((v) => v + 1)];
}

export function roomErrorText(t: Dictionary, error: RoomError, outside: string[] = []): string {
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
