import { ArtistPage } from "@/components/artists/ArtistPage";

export default async function ArtistSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArtistPage slug={decodeURIComponent(slug)} />;
}
