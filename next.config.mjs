/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // All API routes — prevent caching
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      {
        // AudioWorklet processor — short cache with revalidation to prevent stale versions
        source: '/audio-processor.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
    ];
  },
};

export default nextConfig;
