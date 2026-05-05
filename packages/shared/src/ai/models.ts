export const MODELS = {
  default: 'claude-sonnet-4-6',
  reasoning: 'claude-opus-4-7',
  reasoningLargeContext: 'claude-opus-4-7[1m]',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

export function resolveModelId(model: ModelId): string {
  return model.replace(/\[.*\]$/, '');
}
