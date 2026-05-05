import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { video, colors, radius, fontWeights, shadows } from '@virus/shared';
import type { RenderAssets } from '@virus/shared/visuals';
import { HookCard, Captions, SoundEffect, AssetBackdrop } from '@/components';
import { TweetMock } from '@/components/tweet-mock';
import { oxaniumFamily } from '@/lib/fonts';
import type { HotTakeInput } from './schema';

// ── Background ────────────────────────────────────────────────────────────────

const Background: React.FC<{ themeColor: string }> = ({ themeColor }) => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.bg,
      backgroundImage: `radial-gradient(ellipse 80% 50% at 50% 10%, ${themeColor}18 0%, transparent 60%)`,
    }}
  />
);

// ── SplitScreen ───────────────────────────────────────────────────────────────

const SPLIT_FEATURES = [
  { label: 'Contexto del repo', a: '✓ Codebase completo', b: '✗ Solo archivo' },
  { label: 'Edición multi-archivo', a: '✓ Composer AI', b: '✗ No disponible' },
  { label: 'Modelos disponibles', a: 'GPT-4o · Claude · Gemini', b: 'GPT-4o básico' },
  { label: 'Tab completions', a: '⚡ Predictivo', b: '◎ Reactivo' },
];

const SplitScreen: React.FC<{ sideA: string; sideB: string; themeColor: string }> = ({
  sideA,
  sideB,
  themeColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dividerScale = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 200 },
    from: 0,
    to: 1,
  });

  const opacityA = interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const opacityB = interpolate(frame, [0.25 * fps, 0.65 * fps], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const renderSide = (
    label: string,
    values: string[],
    isA: boolean,
    opacity: number
  ) => (
    <div
      style={{
        flex: 1,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 32px',
        gap: 24,
        justifyContent: 'center',
      }}
    >
      <p
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 52,
          fontWeight: fontWeights.black,
          color: isA ? themeColor : colors.textSecondary,
          margin: '0 0 8px',
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}
      >
        {label}
      </p>
      {SPLIT_FEATURES.map((f, i) => (
        <div
          key={f.label}
          style={{
            backgroundColor: isA ? `${themeColor}18` : colors.bgElevated,
            borderRadius: radius.lg,
            padding: '18px 22px',
            border: `1px solid ${isA ? `${themeColor}55` : colors.border}`,
          }}
        >
          <p
            style={{
              margin: '0 0 4px',
              color: colors.textSecondary,
              fontSize: 20,
              fontFamily: oxaniumFamily,
            }}
          >
            {f.label}
          </p>
          <p
            style={{
              margin: 0,
              color: isA ? themeColor : colors.textSecondary,
              fontSize: 28,
              fontWeight: fontWeights.bold,
              fontFamily: oxaniumFamily,
            }}
          >
            {values[i]}
          </p>
        </div>
      ))}
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        paddingTop: video.safeTopPx + 20,
        paddingBottom: video.safeBottomPx + 20,
      }}
    >
      <div style={{ display: 'flex', height: '100%' }}>
        {renderSide(sideA, SPLIT_FEATURES.map((f) => f.a), true, opacityA)}

        {/* Animated divider */}
        <div
          style={{
            width: 3,
            backgroundColor: themeColor,
            opacity: 0.7,
            transform: `scaleY(${dividerScale})`,
            transformOrigin: 'top center',
          }}
        />

        {renderSide(sideB, SPLIT_FEATURES.map((f) => f.b), false, opacityB)}
      </div>
    </AbsoluteFill>
  );
};

// ── TweetMock section ─────────────────────────────────────────────────────────

const TweetSection: React.FC<{
  tweet: HotTakeInput['tweets'][0];
  themeColor: string;
  contextText?: string | undefined;
}> = ({ tweet, themeColor, contextText }) => (
  <AbsoluteFill
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: `${video.safeTopPx + 24}px 40px ${video.safeBottomPx + 24}px`,
      gap: 32,
    }}
  >
    {contextText && (
      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 48,
          fontWeight: fontWeights.black,
          color: colors.textPrimary,
          textAlign: 'center',
          lineHeight: 1.2,
          whiteSpace: 'pre-line',
        }}
      >
        {contextText}
      </p>
    )}
    <TweetMock
      name={tweet.name}
      handle={tweet.handle}
      text={tweet.text}
      avatar={tweet.avatar}
      themeColor={themeColor}
    />
  </AbsoluteFill>
);

// ── Punchline with screen shake ───────────────────────────────────────────────

const PunchlineSection: React.FC<{ text: string; themeColor: string }> = ({
  text,
  themeColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shakeDecay = interpolate(frame, [0, Math.floor(0.3 * fps)], [1, 0], {
    extrapolateRight: 'clamp',
  });
  const shakeX = Math.sin(frame * 42) * 5 * shakeDecay;
  const shakeY = Math.cos(frame * 37) * 5 * shakeDecay;

  const scale = spring({
    fps,
    frame,
    config: { damping: 10, stiffness: 280 },
    from: 1.08,
    to: 1,
  });

  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 40px',
        transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: `${colors.bg}CC`,
          borderWidth: 4,
          borderStyle: 'solid',
          borderColor: themeColor,
          borderRadius: radius['2xl'],
          padding: '48px 56px',
          maxWidth: 900,
          width: '100%',
          boxShadow: shadows.glow(themeColor),
        }}
      >
        <p
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 88,
            fontWeight: fontWeights.black,
            color: colors.textPrimary,
            margin: 0,
            lineHeight: 1.15,
            textAlign: 'center',
            whiteSpace: 'pre-line',
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ── Poll CTA ──────────────────────────────────────────────────────────────────

const FAKE_VOTES = [2847, 1023, 1536, 412];

const PollCta: React.FC<{
  options: string[];
  handle: string;
  themeColor: string;
}> = ({ options, handle, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerY = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 200 },
    from: 80,
    to: 0,
  });

  const containerOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 20}px 40px ${video.safeBottomPx + 20}px`,
        gap: 24,
        transform: `translateY(${containerY}px)`,
        opacity: containerOpacity,
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontFamily: oxaniumFamily,
          fontSize: 56,
          fontWeight: fontWeights.black,
          color: colors.textPrimary,
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        ¿Cuál usás vos?
      </p>

      {options.slice(0, 4).map((opt, i) => {
        const delayFrames = i * Math.floor(0.15 * fps);
        const localFrame = Math.max(0, frame - delayFrames);

        const btnOpacity = interpolate(localFrame, [0, 10], [0, 1], {
          extrapolateRight: 'clamp',
        });
        const btnY = spring({
          fps,
          frame: localFrame,
          config: { damping: 20, stiffness: 200 },
          from: 30,
          to: 0,
        });
        const votes = Math.floor(
          interpolate(localFrame, [0, Math.floor(1.5 * fps)], [0, FAKE_VOTES[i] ?? 500], {
            extrapolateRight: 'clamp',
          })
        );

        const isFirst = i === 0;

        return (
          <div
            key={opt}
            style={{
              width: '100%',
              opacity: btnOpacity,
              transform: `translateY(${btnY}px)`,
              backgroundColor: isFirst ? themeColor : colors.bgElevated,
              borderWidth: 3,
              borderStyle: 'solid',
              borderColor: isFirst ? themeColor : `${themeColor}55`,
              borderRadius: radius.xl,
              padding: '26px 40px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: isFirst ? shadows.glow(themeColor) : 'none',
            }}
          >
            <span
              style={{
                fontFamily: oxaniumFamily,
                fontSize: 48,
                fontWeight: fontWeights.black,
                color: isFirst ? colors.bg : colors.textPrimary,
                letterSpacing: '-0.01em',
              }}
            >
              {opt}
            </span>
            <span
              style={{
                fontFamily: oxaniumFamily,
                fontSize: 32,
                fontWeight: fontWeights.semibold,
                color: isFirst ? `${colors.bg}AA` : colors.textSecondary,
              }}
            >
              {votes.toLocaleString()} votos
            </span>
          </div>
        );
      })}

      <p
        style={{
          margin: '8px 0 0',
          fontFamily: oxaniumFamily,
          fontSize: 32,
          fontWeight: fontWeights.semibold,
          color: themeColor,
        }}
      >
        {displayHandle}
      </p>
    </AbsoluteFill>
  );
};

// ── Main template ─────────────────────────────────────────────────────────────

export const HotTakeTemplate: React.FC<HotTakeInput> = ({
  themeColor,
  segments,
  captions,
  brand,
  sideA,
  sideB,
  tweets,
  pollOptions,
  assets,
}) => {
  const { fps } = useVideoConfig();

  const renderSegmentContent = (seg: HotTakeInput['segments'][0]) => {
    if (seg.visualCue === 'hook-card-glitch') {
      return (
        <HookCard
          text={seg.onScreenText ?? seg.voiceover}
          themeColor={themeColor}
          variant="glitch"
        />
      );
    }

    if (seg.visualCue.startsWith('tweet-mock-')) {
      const idx = parseInt(seg.visualCue.replace('tweet-mock-', ''), 10);
      const tweet = tweets[idx];
      if (!tweet) return null;
      return (
        <TweetSection tweet={tweet} themeColor={themeColor} contextText={seg.onScreenText} />
      );
    }

    if (seg.visualCue === 'split-screen') {
      return <SplitScreen sideA={sideA} sideB={sideB} themeColor={themeColor} />;
    }

    if (seg.visualCue === 'punchline') {
      return (
        <PunchlineSection text={seg.onScreenText ?? seg.voiceover} themeColor={themeColor} />
      );
    }

    if (seg.visualCue === 'poll-cta') {
      return (
        <PollCta options={pollOptions} handle={brand.handle} themeColor={themeColor} />
      );
    }

    return null;
  };

  return (
    <AbsoluteFill>
      <Background themeColor={themeColor} />

      {segments.map((seg) => {
        const from = Math.round(seg.startSec * fps);
        const duration = Math.round((seg.endSec - seg.startSec) * fps);
        const isAssetSlot =
          seg.role === 'hook' || seg.role === 'reveal' || seg.role === 'cta';
        return (
          <Sequence key={seg.index} from={from} durationInFrames={duration}>
            <AbsoluteFill>
              {/* AI backdrop (b-roll video / hero image) — painted first so all
                  other UI sits on top. Renders nothing when `assets` is
                  undefined or this slot has no asset. */}
              {isAssetSlot && (
                <AssetBackdrop
                  slot={seg.role as 'hook' | 'reveal' | 'cta'}
                  themeColor={themeColor}
                  {...(assets ? { assets: assets as RenderAssets } : {})}
                />
              )}
              {renderSegmentContent(seg)}
              {seg.soundEffect && <SoundEffect type={seg.soundEffect} atFrame={0} />}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      <Captions
        words={captions.words}
        themeColor={themeColor}
        style="highlight-word"
        position="bottom"
      />
    </AbsoluteFill>
  );
};
