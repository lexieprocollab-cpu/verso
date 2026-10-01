import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/**
 * Supabase client with the service role key: bypasses row-level security, so
 * it is used only on the server for trusted writes (payments, analytics).
 * Null until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

/** The signed-in user behind a request's "Authorization: Bearer <access token>", or null. */
export async function userFromRequest(request: Request): Promise<{ id: string; email?: string } | null> {
  const supabase = getSupabaseAdmin();
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id, email: data.user.email };
}
