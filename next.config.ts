import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avatar uploads (max 2 MB) go through a Server Action; the default body limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
