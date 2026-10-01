import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null | undefined;

/** The Supabase client (sessions kept in AsyncStorage), or null until configured. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client =
    SUPABASE_URL && SUPABASE_ANON_KEY
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
        })
      : null;
  return client;
}

export async function accessToken(): Promise<string | null> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}
