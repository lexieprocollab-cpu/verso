import { API_URL } from "./config";
import { accessToken } from "./supabase";

/** POSTs to the web app's API as the signed-in learner. */
export async function apiPost<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "sign_in_required" };
  if (!API_URL) return { ok: false, error: "not_configured" };
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    return response.ok ? { ok: true, data: data as T } : { ok: false, error: (data as { error?: string } | null)?.error ?? "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}
