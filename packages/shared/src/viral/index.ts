export * from './types.js';
export * as parser from './parser/index.js';
export * as engine from './engine/index.js';
export * from './trend-aggregator.js';

// Flatten the engine's public API to the top level so consumers can import
// these directly (the worker's anti-repeat orchestrator relies on this).
export { suggest, passesAntiRepeat, DEFAULT_POLICY, getProjectPolicy } from './engine/index.js';
export type { AntiRepeatPolicy } from './engine/index.js';
