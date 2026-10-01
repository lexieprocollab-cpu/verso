// Server-side view of which external services have keys. Only booleans leave
// the server; the keys themselves never do.

export type ServiceStatus = {
  database: boolean;
  ai: boolean;
};

export function serviceStatus(env: Record<string, string | undefined> = process.env): ServiceStatus {
  return {
    database: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ai: Boolean(env.ANTHROPIC_API_KEY),
  };
}
