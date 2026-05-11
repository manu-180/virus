import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@virus/shared', '@virus/db', '@virus/inngest'],
  webpack: (config, { isServer }) => {
    // `sharp` is server-only (uses child_process via detect-libc).
    // The carousel barrel re-exports composer.ts which imports sharp, so we
    // externalize it from the CLIENT bundle to prevent the build error.
    if (!isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'sharp',
      ];
    }
    // Workspace packages use NodeNext-style imports with explicit `.js` —
    // tell webpack to also try `.ts`/`.tsx` when resolving these.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    // Vite-style `?raw` imports → import file as string. Used by @virus/shared
    // for inlined markdown seeds.
    config.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    });
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'https',
        hostname: 'api.assemblyai.com',
      },
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: true,
  hideSourceMaps: true,
  telemetry: false,

  // Only upload source maps in CI (when auth token is present)
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
})
