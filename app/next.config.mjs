/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We serve no images through next/image. Turning the optimizer off removes the /_next/image endpoint,
  // which is where Next's 2026 image-optimizer RCE/DoS advisories live (see docs/SECURITY.md).
  images: { unoptimized: true },
  poweredByHeader: false,
  webpack: (config) => {
    // wagmi/walletconnect optional deps that are not used in the browser build
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
