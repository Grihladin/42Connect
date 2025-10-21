/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.intra.42.fr"
      },
      {
        protocol: "https",
        hostname: "profile.intra.42.fr"
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com"
      }
    ]
  },
  experimental: {
    appDir: true
  }
};

module.exports = nextConfig;
