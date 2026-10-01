import type { MetadataRoute } from "next";

// Installable web app (step 31): add Verso to the home screen on Android and
// iPhone. The service worker (public/sw.js) keeps it working offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Verso — learn languages through songs",
    short_name: "Verso",
    description: "Learn languages through the songs you love",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf8f4",
    theme_color: "#6d4aff",
    categories: ["education", "music"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
