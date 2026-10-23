import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/collections/:path*', destination: '/articles', permanent: true }];
  },
  serverExternalPackages: ['node:sqlite'],
};
export default nextConfig;
