import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Externalize SDK - it will require node-fetch directly from node_modules
  // Our require patch in fetch-polyfill.ts will ensure it gets a function
  serverExternalPackages: ['kucoin-node-sdk', 'node-fetch'],
  
  // Allow requests from domain (not just IP)
  // This ensures the app works with both IP and domain access
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // In production, you might want to restrict this
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
  
  /* config options here */
};

export default nextConfig;
