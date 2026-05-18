/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
  async headers() {
    return [
      {
        source: '/admin',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
