import type { MetadataRoute } from "next";

const baseUrl = "https://sandbox-sdk.sh";

const sitemap = (): MetadataRoute.Sitemap => [
  {
    changeFrequency: "weekly",
    lastModified: new Date(),
    priority: 1,
    url: `${baseUrl}/`,
  },
  {
    changeFrequency: "weekly",
    lastModified: new Date(),
    priority: 0.5,
    url: `${baseUrl}/llms.txt`,
  },
  {
    changeFrequency: "weekly",
    lastModified: new Date(),
    priority: 0.5,
    url: `${baseUrl}/llms-full.txt`,
  },
];

export default sitemap;
