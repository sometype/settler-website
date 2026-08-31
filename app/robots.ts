import type { MetadataRoute } from "next";

/** Phase 1A deliberately omits the index-manifest directive reserved for Phase 1B. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/events", "/api/phone/", "/api/intake/"],
    },
    host: "https://mepatrone.com",
  };
}
