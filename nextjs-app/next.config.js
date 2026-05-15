/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
};

module.exports = nextConfig;
