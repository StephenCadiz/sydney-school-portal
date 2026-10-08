import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sydney School Portal",
    short_name: "Sydney School",
    description: "Sydney School Teacher and Student Portal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f7fa",
    theme_color: "#173b78",
    icons: [
      { src: "/LOGO.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/LOGO.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/LOGO and NAME.png", sizes: "1006x347", type: "image/png", purpose: "any" },
    ],
  };
}
