// Public API for the visual-assets pipeline (shared package half).
//
// The `providers/` subdirectory is owned by another agent and exposes its own
// `providers/index.ts` that this barrel re-exports as a namespace.

export * from './types.js';
export * from './hash.js';
export * from './prompts/build.js';
export * from './prompts/style.js';
export * from './cache/lookup.js';

export * as providers from './providers/index.js';
