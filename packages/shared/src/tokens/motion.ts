export const motion = {
  durations: {
    fast: 150,
    base: 240,
    slow: 420,
    slower: 800,
  },
  easings: {
    standard: [0.4, 0, 0.2, 1] as const,
    decelerate: [0.0, 0.0, 0.2, 1] as const,
    accelerate: [0.4, 0.0, 1, 1] as const,
    spring: { type: 'spring', stiffness: 220, damping: 26 } as const,
  },
};
