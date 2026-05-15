/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
