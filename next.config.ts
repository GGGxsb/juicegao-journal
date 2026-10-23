import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async redirects() {
    return ['collections', 'notes', 'archive'].map(section => ({
      source: `/${section}/:path*`, destination: '/articles', permanent: true,
    }));
  },
  serverExternalPackages: ['node:sqlite'],
};
export default nextConfig;
