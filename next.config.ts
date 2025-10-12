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
      // Mark platform-specific native modules as external CommonJS so webpack doesn't try to resolve/bundle them
      config.externals.push({
        "@abandonware/bluetooth-hci-socket":
          "commonjs @abandonware/bluetooth-hci-socket",
        "bluetooth-hci-socket": "commonjs bluetooth-hci-socket",
        "noble-mac": "commonjs noble-mac",
        "xpc-connection": "commonjs xpc-connection",
      });
    }
    return config;
  },
};

export default nextConfig;
