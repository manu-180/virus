declare module '*.md?raw' {
  const content: string;
  export default content;
}

// NOTE: the optional `nodejs-whisper` peer dependency is loaded via an indirect
// dynamic import in src/captions/whisper-fallback.ts, so no ambient module
// declaration is needed — it type-checks in every package (e.g. @virus/worker)
// whether or not the package is installed.
