import { RoomScreen } from "@/components/rooms/Room";

export default async function RoomPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  return <RoomScreen songId={decodeURIComponent(songId)} />;
}
