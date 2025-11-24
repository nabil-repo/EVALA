/** @type {import('next').NextConfig} */
import { env } from 'process';
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  compiler: {
    removeConsole: env.NODE_ENV === 'production',
  },
};

export default nextConfig;
