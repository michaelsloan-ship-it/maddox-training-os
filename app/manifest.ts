import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maddox Training OS",
    short_name: "Maddox Training",
    description: "Private youth hockey training planner and live session app.",
    start_url: "/today",
    display: "standalone",
    background_color: "#eef8fb",
    theme_color: "#10283b",
    icons: [
      { src: "/icons/maddox-training-os-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/maddox-training-os-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
