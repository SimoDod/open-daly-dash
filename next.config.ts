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
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "bluetooth-hci-socket": "@abandonware/bluetooth-hci-socket",
      };
      config.externals.push({
        "@abandonware/bluetooth-hci-socket":
          "commonjs @abandonware/bluetooth-hci-socket",
        "noble-mac": "commonjs noble-mac",
        "xpc-connection": "commonjs xpc-connection",
      });
    }
    return config;
  },
};

export default nextConfig;
