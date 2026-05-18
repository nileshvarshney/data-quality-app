/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  // Static export only for production (Cloudflare Pages).
  // In dev, the constraint blocks direct navigation to dynamic UUID routes.
  output: isProd ? 'export' : undefined,
  trailingSlash: true,
  reactStrictMode: true,

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Static export cannot use server-side image optimization
  images: {
    unoptimized: true,
  },

  compress: true,

  env: {
    NEXT_PUBLIC_API_URL:       process.env.NEXT_PUBLIC_API_URL       || 'http://localhost:8000',
    NEXT_PUBLIC_AUTH_REQUIRED: process.env.NEXT_PUBLIC_AUTH_REQUIRED || 'false',
    NEXT_PUBLIC_APP_ENV:       process.env.NEXT_PUBLIC_APP_ENV       || 'local',
  },
  // Caching headers handled by public/_headers (Cloudflare Pages CDN-level)
}

module.exports = nextConfig
