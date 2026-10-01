import { PlayerScreen } from "@/components/Screens";

export default async function PlayerPage({ searchParams }: { searchParams: Promise<{ song?: string; line?: string }> }) {
  const { song, line } = await searchParams;
  const startLine = line !== undefined && /^\d+$/.test(line) ? Number(line) : null;
  return <PlayerScreen songId={song} startLine={startLine} />;
}
