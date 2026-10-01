import { DirectChatScreen } from "@/components/rooms/DirectChat";

export default async function DirectChatPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <DirectChatScreen otherId={decodeURIComponent(userId)} />;
}
