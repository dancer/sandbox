import type { MetadataRoute } from "next";

const baseUrl = "https://sandbox-sdk.sh";

const sitemap = (): MetadataRoute.Sitemap => [
  {
    changeFrequency: "weekly",
    lastModified: new Date(),
    priority: 1,
    url: `${baseUrl}/`,
  },
];

export default sitemap;
