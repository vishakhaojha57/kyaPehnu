import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/kyapehnu-app",
    name: "KyaPehnu – AI Wardrobe Intelligence",
    short_name: "KyaPehnu",
    description:
      "Smart AI wardrobe intelligence. Discover personalized outfit suggestions powered by your personal clothing catalogue.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0c0c0f",
    theme_color: "#0c0c0f",
    categories: ["lifestyle", "shopping", "utilities"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Outfit Suggestions",
        short_name: "Outfits",
        description: "View today's AI-curated outfits",
        url: "/?tab=outfits",
        icons: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "My Wardrobe",
        short_name: "Wardrobe",
        description: "Browse and manage your clothes",
        url: "/?tab=wardrobe",
        icons: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "AI Vision Scanner",
        short_name: "Scan",
        description: "Scan and digitize new clothes",
        url: "/?tab=vision",
        icons: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        ],
      },
    ],
  };
}
