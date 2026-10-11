import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Device reports are runtime user data, never deployment assets.
  outputFileTracingExcludes: { "/*": ["./data/devices/**/*"] },
};

export default nextConfig;
