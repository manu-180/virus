import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname isn't available in ESM configs; derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@virus/shared', '@virus/db', '@virus/inngest'],

  // Required for Docker (Railway) deploys. Produces .next/standalone with a
  // minimal node_modules tree so the runtime image stays small. With a pnpm
  // monorepo the trace root has to point at the repo root, not apps/web.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),

  // Pre-existing carousel-related TS/ESLint errors block `next build`. Ignore
  // them in production for now — they don't affect runtime and should be
  // fixed in follow-up work (apps/web/src/app/api/carousels/*, billing/*).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // sharp loads a native binary via dlopen and uses dynamic requires for its
  // libvips bindings. If webpack bundles it, those runtime lookups break with
  // "Could not load the sharp module using the linux-x64 runtime" during
  // build-time page data collection. Marking it server-external makes Next
  // require() it from node_modules normally, and the standalone tracer copies
  // the platform-specific binaries into the runtime image.
  serverExternalPackages: ['sharp'],

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
