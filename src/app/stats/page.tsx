import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { EVENT_NAMES } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Launch stats · Verso", robots: { index: false } };

const GATE_TARGET = 40;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function keyMatches(given: string | undefined): boolean {
  const expected = process.env.STATS_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Team dashboard for the launch gate: open as /stats?key=<STATS_KEY>. */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!keyMatches(key)) {
    return <p className="pt-10 text-center text-muted">Not available.</p>;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return <p className="pt-10 text-center text-muted">Connect Supabase (service role key) to see stats.</p>;
  }

  const since = daysAgo(30);
  const [{ data: gate, error }, ...counts] = await Promise.all([
    supabase.rpc("first_session_gate", { since }).single<{ new_devices: number; saved_five_plus: number; percent: number | null }>(),
    ...EVENT_NAMES.map((name) =>
      supabase.from("events").select("id", { count: "exact", head: true }).eq("name", name).gte("created_at", since),
    ),
  ]);
  if (error) return <p className="pt-10 text-center text-muted">Couldn&apos;t load stats: {error.message}</p>;

  const percent = gate?.percent ?? 0;
  const passing = percent >= GATE_TARGET;

  return (
    <section className="space-y-6 pt-4" dir="ltr">
      <h1 className="text-3xl font-bold">Launch stats</h1>
      <p className="text-muted">Last 30 days · anonymous devices</p>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-medium text-muted">Launch gate: new users who save 5+ words in their first session</p>
        <p className={`mt-2 text-5xl font-bold ${passing ? "text-green-600 dark:text-green-400" : "text-amber-600"}`}>{percent}%</p>
        <p className="mt-1 text-sm text-muted">
          {gate?.saved_five_plus ?? 0} of {gate?.new_devices ?? 0} new devices · target {GATE_TARGET}% · {passing ? "passing" : "not yet"}
        </p>
      </div>

      <table className="w-full overflow-hidden rounded-2xl border border-border bg-surface text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2 font-medium">Event</th>
            <th className="px-4 py-2 text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {EVENT_NAMES.map((name, i) => (
            <tr key={name} className="border-t border-border">
              <td className="px-4 py-2 font-mono">{name}</td>
              <td className="px-4 py-2 text-right tabular-nums">{counts[i].count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
