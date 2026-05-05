import Anthropic from '@anthropic-ai/sdk';
import { MODELS, resolveModelId } from '@virus/shared/ai';
import type { ProjectFileKind } from '../../events/project-events.js';

/**
 * Use Claude Sonnet 4.6 vision to convert an uploaded image (a screenshot of
 * notes, a Notion export PNG, a Figma snippet, etc.) into structured markdown
 * that the deterministic parser can then chew through.
 *
 * The system prompt asks for the EXACT section headings the markdown parser
 * recognizes, so the output is drop-in compatible with parsePatterns/parseBrand.
 */

const PATTERNS_SYSTEM = `You are a document OCR + restructuring assistant.
The user will give you an image that contains viral content patterns for a creator project.
Output ONLY markdown with these EXACT level-2 headings (in this order, in Spanish or English — keep the heading words verbatim):

## Hooks
## Formatos
## Topics
## Pacing
## Visual elements
## CTAs
## Hashtags
## Caption templates

Under each heading, list the items found in the image as a markdown bullet list.
Preserve the original language. If a section is empty in the image, still output the heading with no items.
Do NOT add commentary, explanations, or code fences. Just the markdown.`;

const PROJECT_INFO_SYSTEM = `You are a document OCR + restructuring assistant.
The user will give you an image that contains brand / project information.
Output ONLY markdown with these EXACT level-2 headings (in this order, in Spanish or English — keep the heading words verbatim):

## Brand
## One-liner
## Audience
## Value Props
## Features
## Case Studies
## Voice & Tone
## CTAs
## Do Not Say

Under each heading, list the content found in the image. Use bullet lists where appropriate.
Preserve the original language. If a section is empty, still output the heading with no items.
Do NOT add commentary, explanations, or code fences. Just the markdown.`;

const SUPPORTED_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function inferMediaType(blobType: string | undefined): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (blobType && SUPPORTED_MEDIA.has(blobType)) {
    return blobType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  }
  // Sensible default — most editor exports / phone screenshots are png.
  return 'image/png';
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  }
  return _client;
}

/**
 * Test-only override.
 */
export function __setAnthropicClientForImageTests(client: Anthropic | null): void {
  _client = client;
}

export async function extractFromImage(
  blob: Blob,
  kind: ProjectFileKind,
): Promise<{ text: string }> {
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mediaType = inferMediaType(blob.type);

  const system = kind === 'viral_patterns' ? PATTERNS_SYSTEM : PROJECT_INFO_SYSTEM;

  const client = getClient();
  const response = await client.messages.create({
    model: resolveModelId(MODELS.default),
    max_tokens: 4096,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: 'Extract the structured markdown from this image, following the system instructions exactly.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;

  if (!textBlock) {
    console.warn('[image] Claude returned no text block — proceeding with empty string');
  }
  return { text: textBlock?.text ?? '' };
}
