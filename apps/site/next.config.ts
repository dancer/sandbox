import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects() {
    return [
      {
        destination: "https://sandbox-sdk.sh/:path*",
        has: [{ type: "host", value: "sandbox-sdk.com" }],
        permanent: true,
        source: "/:path*",
      },
      {
        destination: "https://sandbox-sdk.sh/:path*",
        has: [{ type: "host", value: "www.sandbox-sdk.com" }],
        permanent: true,
        source: "/:path*",
      },
    ];
  },
};

export default nextConfig;
