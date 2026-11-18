import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Device reports and reader settings stay local.
  outputFileTracingExcludes: {
    "/*": ["./data/devices/**/*", "./.ccusage/**/*"],
  },
};

export default nextConfig;
