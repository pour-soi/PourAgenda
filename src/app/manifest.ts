import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PourAgenda",
    short_name: "PourAgenda",
    description: "Private appointment and schedule management.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f3",
    theme_color: "#375f52",
    icons: [
      { src: "/icon-48.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icon-64.png", sizes: "64x64", type: "image/png", purpose: "any" },
      { src: "/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
