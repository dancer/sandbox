import type { MetadataRoute } from "next";

const baseUrl = "https://sandbox-sdk.sh";

const robots = (): MetadataRoute.Robots => ({
  rules: {
    allow: "/",
    userAgent: "*",
  },
  sitemap: `${baseUrl}/sitemap.xml`,
});

export default robots;
