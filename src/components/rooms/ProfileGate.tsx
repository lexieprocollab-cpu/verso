"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OwnProfile, RoomsBackend } from "@/lib/rooms/backend";
import { isOldEnough } from "@/lib/rooms/rules";
import { usePreferences } from "../Preferences";
import { ProfileSetup } from "./ProfileSetup";
import { ageLockStore, useLive, useRoomsBackend } from "./useRooms";

/**
 * Shows `children` once the learner is signed in (cloud), 13+ and has a room
 * profile; otherwise the sign-in hint, the age notice or the profile form.
 */
export function ProfileGate({ children }: { children: (rooms: RoomsBackend, me: OwnProfile) => ReactNode }) {
  const { t } = usePreferences();
  const rooms = useRoomsBackend();
  const [me, reloadMe] = useLive(rooms ? () => rooms.me() : null, null, [rooms]);
  const ageLocked = ageLockStore.useValue();

  if (!rooms || me === undefined) return <p className="pt-4 text-muted">…</p>;
  if (rooms.kind === "cloud" && me === null) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5">
        <Link href="/settings" className="underline">
          {t.rooms.signIn}
        </Link>
      </p>
    );
  }
  if (ageLocked || (me?.birthYear && me.birthMonth && !isOldEnough(me.birthYear, me.birthMonth, new Date()))) {
    return <p className="rounded-2xl border border-border bg-surface p-5 font-medium">{t.rooms.tooYoung}</p>;
  }
  if (!me?.name || !me.birthYear || !me.birthMonth) return <ProfileSetup rooms={rooms} current={me} onSaved={reloadMe} />;
  return <>{children(rooms, me)}</>;
}
