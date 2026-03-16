const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  reactStrictMode: true,

  turbopack: {},

  webpack: (config:any) => {
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
