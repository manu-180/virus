/**
 * story-composer — Build a 1080x1920 (9:16) Story image from the first
 * carousel slide.
 *
 * Carousel slides are 1080x1350 (4:5). Instagram Stories are 9:16. Posting
 * the square slide as-is would letterbox with ugly black bars top and bottom.
 *
 * This composer takes the already-composed first slide and produces a
 * Story-ready PNG:
 *
 *   ┌─────────────────────────┐
 *   │ blurred + dimmed slide  │  ← background fills the full 9:16 canvas
 *   │   ┌─────────────────┐   │
 *   │   │                 │   │  ← original slide centered, rounded corners
 *   │   │  ORIGINAL SLIDE │   │     ~82% width (~890px), drop shadow effect
 *   │   │                 │   │     courtesy of the blurred bg behind it
 *   │   └─────────────────┘   │
 *   │                         │
 *   │   → MIRÁ EL POST       │  ← bottom CTA, white text + accent arrow
 *   │     COMPLETO            │
 *   └─────────────────────────┘
 *
 * Stories under 10k followers cannot use link stickers, so the CTA is the
 * only thing telling viewers there's a full post to find.
 */

import satori from 'satori';
import sharp from 'sharp';
import type { StylePreset } from './templates.js';
import { loadFonts } from './fonts.js';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Foreground slide takes ~82% of the canvas width, leaving comfortable
// margins on the sides and clear room for the CTA below.
const SLIDE_WIDTH_RATIO = 0.82;
const SLIDE_CORNER_RADIUS = 32;

// Source slide aspect (4:5) — composer.ts SLIDE_WIDTH / SLIDE_HEIGHT
const SLIDE_SOURCE_ASPECT = 1350 / 1080;

// CTA footer dimensions
const CTA_HEIGHT = 220;
const CTA_BOTTOM_MARGIN = 80;

export interface ComposeStoryArgs {
  /**
   * The already-composed first slide PNG (1080x1350). This is what
   * compose-carousel-overlay produced and uploaded to Storage.
   */
  slideImage: Buffer;
  /** Style preset — used to pick the accent color for the CTA arrow. */
  preset: StylePreset;
}

/**
 * Compose a 9:16 Story image from a single carousel slide.
 * Returns a PNG buffer ready to upload to Storage and publish via the
 * Instagram Graph API (media_type=STORIES).
 */
export async function composeStoryFromSlide(args: ComposeStoryArgs): Promise<Buffer> {
  const { slideImage, preset } = args;

  // ── 1. Background: blurred + darkened version of the slide ────────────
  // Heavy blur (sigma 60) erases any text legibility from the source so the
  // background reads as ambient color, not as a duplicate of the foreground.
  // Brightness 0.55 + a vertical gradient overlay below give the white CTA
  // text enough contrast at the bottom.
  const background = await sharp(slideImage)
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover' })
    .blur(60)
    .modulate({ brightness: 0.55 })
    .toBuffer();

  // ── 2. Rounded-corner foreground slide ────────────────────────────────
  const slideWidthPx = Math.round(STORY_WIDTH * SLIDE_WIDTH_RATIO);
  const slideHeightPx = Math.round(slideWidthPx * SLIDE_SOURCE_ASPECT);

  const roundedMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${slideWidthPx}" height="${slideHeightPx}">` +
      `<rect width="${slideWidthPx}" height="${slideHeightPx}" ` +
      `rx="${SLIDE_CORNER_RADIUS}" ry="${SLIDE_CORNER_RADIUS}" fill="white"/>` +
      `</svg>`,
  );

  const slideRounded = await sharp(slideImage)
    .resize(slideWidthPx, slideHeightPx, { fit: 'cover' })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Soft drop shadow: blurred black silhouette of the rounded rect, offset
  // slightly down. Gives the foreground slide perceived depth against the
  // blurred background instead of feeling pasted on top.
  const shadowMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${slideWidthPx + 80}" height="${slideHeightPx + 80}">` +
      `<rect x="40" y="40" width="${slideWidthPx}" height="${slideHeightPx}" ` +
      `rx="${SLIDE_CORNER_RADIUS}" ry="${SLIDE_CORNER_RADIUS}" fill="rgba(0,0,0,0.45)"/>` +
      `</svg>`,
  );
  const shadow = await sharp(shadowMask).blur(24).toBuffer();

  // ── 3. CTA footer rendered via Satori ─────────────────────────────────
  const fonts = await loadFonts();
  const ctaAccent = preset.accentColor || '#FFFFFF';

  const ctaSvg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: STORY_WIDTH,
          height: CTA_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '20px',
                color: '#FFFFFF',
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase' as const,
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      display: 'flex',
                      color: ctaAccent,
                      fontSize: 52,
                    },
                    children: ['→'],
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: { display: 'flex' },
                    children: ['Mirá el post completo'],
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                color: 'rgba(255,255,255,0.65)',
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '0.16em',
                textTransform: 'uppercase' as const,
                marginTop: '14px',
              },
              children: ['en mi perfil'],
            },
          },
        ],
      },
    } as unknown as Parameters<typeof satori>[0],
    { width: STORY_WIDTH, height: CTA_HEIGHT, fonts },
  );

  // ── 4. Composite all layers ───────────────────────────────────────────
  // Vertical bias: pull the slide slightly above center so the CTA at the
  // bottom has its own breathing room.
  const verticalLift = 110;
  const slideTop = Math.max(0, Math.round((STORY_HEIGHT - slideHeightPx) / 2 - verticalLift));
  const slideLeft = Math.round((STORY_WIDTH - slideWidthPx) / 2);
  const shadowTop = slideTop - 40;
  const shadowLeft = slideLeft - 40;
  const ctaTop = STORY_HEIGHT - CTA_HEIGHT - CTA_BOTTOM_MARGIN;

  return sharp(background)
    .composite([
      { input: shadow, top: shadowTop, left: shadowLeft },
      { input: slideRounded, top: slideTop, left: slideLeft },
      { input: Buffer.from(ctaSvg), top: ctaTop, left: 0 },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}
