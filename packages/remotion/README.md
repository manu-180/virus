# @virus/remotion

Remotion video rendering package for the Virus content machine. Renders 1080×1920 vertical videos (TikTok/Reels/Shorts format).

## Dev preview

```bash
pnpm --filter @virus/remotion dev
# Remotion Studio opens at http://localhost:3000
```

## Local render

```bash
pnpm exec remotion render Hello out/hello.mp4
# With custom props:
pnpm exec remotion render tip out/tip.mp4 --props='{"totalDurationSec":30,"themeColor":"#3ECF8E",...}'
```

## Adding a new template

Each template lives in its own folder under `src/templates/{name}/`:

```
src/templates/{name}/
├── index.tsx     ← Main React component (default export + named export)
├── schema.ts     ← Zod schema extending or narrowing videoInputSchema
└── defaults.ts   ← Default props for Remotion Studio preview
```

1. Create the folder and three files above.
2. Export `{Name}Template`, `{name}Schema`, `{name}Defaults` from `index.tsx` / `schema.ts` / `defaults.ts`.
3. Import them in `src/Root.tsx` and register a `<Composition>` with `calculateMetadata`.

### Shared utilities available

```ts
import { VideoInput, videoInputSchema } from '../lib/types';
import { useTokens } from '../lib/use-tokens';
import { SafeZones } from '../lib/safe-zones';
import { VoiceoverAudio, BackgroundMusic } from '../lib/audio-loader';
```

- **`useTokens(themeColor?)`** — returns design tokens (colors, fonts, video). Pass `themeColor` to override accent.
- **`<SafeZones enabled />`** — renders red overlays for top (250px) and bottom (350px) safe zones. Enable only in dev.
- **`<VoiceoverAudio url={...} />`** — plays the voiceover track from a URL.
- **`<BackgroundMusic mood="lofi" volume={0.2} />`** — plays a track from `public/music/{mood}.mp3`.

### Safe zones

No critical UI elements (captions, hook text, CTA) may fall within:
- Top 250px — covered by platform UI (status bar, camera)
- Bottom 350px — covered by platform UI (nav, comments, buttons)

Use `video.safeTopPx` and `video.safeBottomPx` from `@virus/shared` tokens.

## Music files

Background music tracks go in `public/music/`. Expected filenames:
- `lofi.mp3`
- `synthwave.mp3`
- `phonk.mp3`
- `cinematic.mp3`

Placeholder `.gitkeep` is in place — add real tracks from Epidemic Sound or YouTube Audio Library (T7).

## Templates roadmap

| ID | Template | Prompt |
|----|----------|--------|
| `Hello` | Placeholder (current) | T3-P01 |
| `tip` | Quick tip format | T3-P02 |
| `hot-take` | Contrarian opinion | T3-P03 |
| `speed-build` | Fast coding demo | T3-P04 |
| `listicle` | Numbered list | T3-P05 |
| `story` | Story arc | T3-P06 |
| `comparison` | A vs B | T3-P07 |
