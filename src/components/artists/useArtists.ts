"use client";

import { createCloudArtists, createDeviceArtists, type ArtistClient, type ArtistError } from "@/lib/artistClient";
import type { Dictionary } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { useHydrated } from "../useSongs";

let client: ArtistClient | undefined;

/** Cloud artist uploads once Supabase is configured; otherwise the device demo. Null during server render. */
export function useArtists(): ArtistClient | null {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const db = getSupabase();
  client ??= db ? createCloudArtists(db) : createDeviceArtists();
  return client;
}

export function artistErrorText(t: Dictionary, error: ArtistError): string {
  if (error === "slug_taken") return t.artists.slugTaken;
  if (error === "sign_in_required") return t.artists.signIn;
  return t.ai.failed;
}
