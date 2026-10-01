import { QuizScreen } from "@/components/Screens";

export default async function QuizPage({ searchParams }: { searchParams: Promise<{ song?: string }> }) {
  const { song } = await searchParams;
  return <QuizScreen songId={song} />;
}
