import { JoinFamily } from "@/components/JoinFamily";

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <JoinFamily initialCode={typeof code === "string" ? code.slice(0, 8) : ""} />;
}
