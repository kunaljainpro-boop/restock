import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ReStock — FMCG Reorder List",
    short_name: "ReStock",
    description: "Add Fast. Find Fast. Buy Fast. Smart market purchase list for FMCG shops.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#ef1d27",
    categories: ["business", "productivity", "shopping"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/restock.png",
        sizes: "512x512",
        type: "image/png",
        label: "ReStock Home Screen",
      },
    ],
    shortcuts: [
      {
        name: "Add Item",
        url: "/#home",
        description: "Quickly add to market list",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "View List",
        url: "/#list",
        description: "Open active market list",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
    prefer_related_applications: false,
  };
}
