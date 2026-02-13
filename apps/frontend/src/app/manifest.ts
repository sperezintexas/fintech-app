import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "myInvestments",
    short_name: "myInvestments",
    start_url: "/",
    display: "standalone",
    background_color: "#05060A",
    theme_color: "#0B1220",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
