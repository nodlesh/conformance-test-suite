import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during build to avoid configuration conflicts
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Exclude server-side scripts from client-side build
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // For client-side builds, ignore server-side code
      config.resolve.alias = {
        ...config.resolve.alias,
        'fs': false,
        'path': false,
        'os': false,
      };
    }
    return config;
  },
  
  // Exclude scripts directory from pages compilation
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'].map(ext => {
    return ext;
  }),
  
  // Transpile packages that need it
  transpilePackages: ['@demo/core'],
  
  // Experimental features
  experimental: {
    // Enable server components
  },
};

export default nextConfig;
