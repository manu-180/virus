import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import {
  Captions,
  HookCard,
  CodeBlock,
  CtaCard,
  ZoomPunch,
  FlashTransition,
  SoundEffect,
  AssetBackdrop,
} from '@/components';
import { VoiceoverAudio, BackgroundMusic } from '@/lib/audio-loader';
import { SafeZones } from '@/lib/safe-zones';
import { useTokens } from '@/lib/use-tokens';
import type { RenderAssets } from '@virus/shared/visuals';
import type { TipInput } from './schema';

export const TipTemplate: React.FC<TipInput> = (props) => {
  const {
    themeColor,
    audioUrl,
    segments,
    captions,
    musicMood,
    brand,
    variant,
    totalDurationSec,
    assets,
  } = props;
  const { fps } = useVideoConfig();
  const tokens = useTokens(themeColor);

  return (
    <AbsoluteFill style={{ background: tokens.bg, fontFamily: tokens.fonts.sans }}>
      <VoiceoverAudio url={audioUrl} />
      {musicMood !== undefined && <BackgroundMusic mood={musicMood} volume={0.18} />}

      {segments.map((seg) => {
        const clampedEnd = Math.min(seg.endSec, totalDurationSec);
        const startFrame = Math.round(seg.startSec * fps);
        const durFrames = Math.max(1, Math.round((clampedEnd - seg.startSec) * fps));

        // For split variant: find nearest preceding segment with code
        const prevCode =
          variant === 'split' && seg.codeSnippet != null
            ? ([...segments.slice(0, seg.index)]
                .reverse()
                .find((s) => s.codeSnippet)?.codeSnippet ?? null)
            : null;

        // Segments that render a text card (hook / reveal / mini_payoff with text)
        const isCardSeg =
          seg.role === 'hook' ||
          seg.role === 'reveal' ||
          (seg.role === 'mini_payoff' && seg.onScreenText != null);

        const cardText = seg.onScreenText ?? seg.voiceover;
        const cardVariant =
          variant === 'dense' ? (seg.role === 'mini_payoff' ? 'glitch' : 'punch') : 'slide';
        const withZoom = variant === 'dense' && seg.role !== 'mini_payoff';

        const isAssetSlot =
          seg.role === 'hook' || seg.role === 'reveal' || seg.role === 'cta';

        return (
          <Sequence key={seg.index} from={startFrame} durationInFrames={durFrames}>
            {/* AI backdrop (b-roll video / hero image) — painted first so all other
                UI sits on top. Renders nothing when `assets` is undefined or this
                slot has no asset, leaving the template's solid bg as fallback. */}
            {isAssetSlot && (
              <AssetBackdrop
                slot={seg.role as 'hook' | 'reveal' | 'cta'}
                themeColor={themeColor}
                {...(assets ? { assets: assets as RenderAssets } : {})}
              />
            )}

            {/* Text card: hook / reveal / mini_payoff */}
            {isCardSeg &&
              (withZoom ? (
                <ZoomPunch>
                  <HookCard text={cardText} themeColor={themeColor} variant={cardVariant} />
                </ZoomPunch>
              ) : (
                <HookCard text={cardText} themeColor={themeColor} variant={cardVariant} />
              ))}

            {/* Code — dense or minimal */}
            {seg.codeSnippet != null && variant !== 'split' && (
              <CodeBlock
                code={seg.codeSnippet.code}
                language={seg.codeSnippet.language}
                themeColor={themeColor}
                animation={variant === 'dense' ? 'typewriter' : 'fade-in'}
              />
            )}

            {/* Code — split: before (left) / after (right) */}
            {seg.codeSnippet != null && variant === 'split' && (
              <>
                {prevCode !== null ? (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: '50%',
                        overflow: 'hidden',
                      }}
                    >
                      <CodeBlock
                        code={prevCode.code}
                        language={prevCode.language}
                        themeColor="#E57373"
                        animation="fade-in"
                      />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '50%',
                        right: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <CodeBlock
                        code={seg.codeSnippet.code}
                        language={seg.codeSnippet.language}
                        themeColor={themeColor}
                        animation="fade-in"
                      />
                    </div>
                  </>
                ) : (
                  <CodeBlock
                    code={seg.codeSnippet.code}
                    language={seg.codeSnippet.language}
                    themeColor={themeColor}
                    animation="fade-in"
                  />
                )}
              </>
            )}

            {/* CTA */}
            {seg.role === 'cta' && (
              <CtaCard ctaText={seg.voiceover} handle={brand.handle} themeColor={themeColor} />
            )}

            {/* Sound effect */}
            {seg.soundEffect != null && <SoundEffect type={seg.soundEffect} atFrame={0} />}
          </Sequence>
        );
      })}

      {/* Captions always on — safe zone bottom */}
      <Captions words={captions.words} themeColor={themeColor} style="highlight-word" position="bottom" />

      {/* Flash transitions between segments — dense only */}
      {variant === 'dense' &&
        segments.slice(1).map((seg) => {
          const startFrame = Math.round(seg.startSec * fps);
          return (
            <Sequence key={`flash-${seg.index}`} from={startFrame} durationInFrames={9}>
              <FlashTransition color={themeColor} durationFrames={9} />
            </Sequence>
          );
        })}

      <SafeZones enabled={false} />
    </AbsoluteFill>
  );
};
