import type Anthropic from '@anthropic-ai/sdk';

export function cachedText(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } };
}

export function withCacheOnLast(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) => {
    if (i === tools.length - 1) {
      return { ...t, cache_control: { type: 'ephemeral' } } as Anthropic.Tool;
    }
    return t;
  });
}
