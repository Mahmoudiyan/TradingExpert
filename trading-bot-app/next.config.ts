import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Externalize SDK - it will require node-fetch directly from node_modules
  // Our require patch in fetch-polyfill.ts will ensure it gets a function
  experimental: {
    serverComponentsExternalPackages: ['kucoin-node-sdk', 'node-fetch'],
  },
  /* config options here */
};

export default nextConfig;
