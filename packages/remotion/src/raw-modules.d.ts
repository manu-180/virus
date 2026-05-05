// Vite-style raw imports — supported by webpack via `resourceQuery: /raw/`
// rule in deploy.ts (Lambda) and Studio config. Used by @virus/shared for
// inlined markdown seeds.
declare module '*.md?raw' {
  const content: string;
  export default content;
}

// Optional peer dep — declared so dynamic import() in shared/whisper-fallback
// type-checks without requiring the package to be installed.
declare module 'nodejs-whisper' {
  const _default: unknown;
  export = _default;
}
