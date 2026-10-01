import { Text, View } from "react-native";
import type { Media } from "../lib/usePlayback";

/** The web build of the mobile app is for testing; YouTube songs play in the phone app and on the website. */
export function YouTubeVideo(_props: { videoId: string; onMedia: (media: Media) => void }) {
  return (
    <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff" }}>▶ YouTube</Text>
    </View>
  );
}
