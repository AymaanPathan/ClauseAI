import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Silence pino-pretty missing module warning from @walletconnect deps
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
