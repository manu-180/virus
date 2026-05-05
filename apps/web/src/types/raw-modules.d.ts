// Vite-style raw imports — supported by webpack via the `resourceQuery: /raw/`
// rule in next.config.ts. Used by @virus/shared for inlined markdown seeds.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
