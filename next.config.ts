import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "@abandonware/noble",
        "@abandonware/bluetooth-hci-socket",
      ];
    }
    return config;
  },
};

export default nextConfig;
