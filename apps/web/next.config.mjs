// The API is the separate Express app in apps/api. Every /api/*
// request is proxied there same-origin, so httpOnly cookies keep working and
// client code calls relative /api/... URLs unchanged.
// Rewrites are fixed when `next build` / `next dev` starts — changing
// API_ORIGIN needs a rebuild (or dev restart), not just a `next start` restart.
// proxyTimeout only applies when Next itself proxies (next dev / next start);
// on Vercel the platform proxies external rewrites with its own ~120s cap.
import path from 'node:path';

const DEV_API_ORIGIN = 'http://localhost:4100'; // `npm run dev:all` default

const apiOrigin = (process.env.API_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : DEV_API_ORIGIN)).replace(/\/+$/, '');
if (!apiOrigin) {
  throw new Error('API_ORIGIN is required in production (URL of the Express API, e.g. https://api.example.com)');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker: ship `.next/standalone` (server.js + only the traced modules)
  // instead of the whole workspace node_modules.
  output: 'standalone',
  // This is an npm workspace, so tracing must start at the REPO ROOT or the
  // hoisted node_modules above apps/web are left out of the standalone bundle.
  // Output then lands at .next/standalone/apps/web/server.js.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  images: {
    remotePatterns: [
      // Uploads (apps/api/src/lib/storage/s3.ts).
      { protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
      // Older uploads still point at Vercel Blob.
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  // Default proxy timeout is 30s; payment/initiate waits up to 270s on Waafi.
  experimental: { proxyTimeout: 300_000 },
  async rewrites() {
    return {
      beforeFiles: [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }],
    };
  },
};

export default nextConfig;
