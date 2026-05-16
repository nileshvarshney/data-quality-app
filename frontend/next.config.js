/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Faster builds and smaller bundles
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },

  // HTTP compression
  compress: true,

  // Turbopack for dev (faster HMR)
  // turbopack: {},   // uncomment if using Next 15 Turbopack

  // Env passthrough
  env: {
    NEXT_PUBLIC_API_URL:      process.env.NEXT_PUBLIC_API_URL      || 'http://localhost:8000',
    NEXT_PUBLIC_AUTH_REQUIRED:process.env.NEXT_PUBLIC_AUTH_REQUIRED|| 'false',
    NEXT_PUBLIC_APP_ENV:      process.env.NEXT_PUBLIC_APP_ENV      || 'local',
  },

  // Aggressive caching headers for static assets
  async headers() {
    return [
      {
        source: '/(.*\\.svg|.*\\.png|.*\\.ico|.*\\.woff2)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

module.exports = nextConfig
