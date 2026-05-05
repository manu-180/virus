import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
  Img,
} from 'remotion';
import { colors, fontWeights, radius, video } from '@virus/shared';
import {
  Captions,
  HookCard,
  CodeBlock,
  CtaCard,
  Counter,
  FlashTransition,
  SoundEffect,
} from '@/components';
import { VoiceoverAudio, BackgroundMusic } from '@/lib/audio-loader';
import { SafeZones } from '@/lib/safe-zones';
import { useTokens } from '@/lib/use-tokens';
import { oxaniumFamily } from '@/lib/fonts';
import type { ListicleInput } from './schema';

type ListicleItem = ListicleInput['listicle']['items'][number];
type Segment = ListicleInput['segments'][number];

// ── ItemCard ──────────────────────────────────────────────────────────────────

const ItemCard: React.FC<{
  item: ListicleItem;
  themeColor: string;
  revealed?: boolean;
}> = ({ item, themeColor, revealed = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hasCode = item.demoCodeSnippet != null && revealed;
  const hasScreenshot = item.screenshotUrl != null && revealed;
  const hasMedia = hasCode || hasScreenshot;

  const slideUp = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 160, mass: 1 },
    from: 80,
    to: 0,
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Text block */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 72,
          right: 72,
          ...(hasMedia ? {} : { bottom: 160 }),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: hasMedia ? 'flex-start' : 'center',
          gap: 20,
          opacity,
          transform: `translateY(${slideUp}px)`,
          filter: revealed ? 'none' : 'blur(14px)',
        }}
      >
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 36,
            fontWeight: fontWeights.bold,
            color: themeColor,
            letterSpacing: 2,
          }}
        >
          #{item.rank}
        </span>
        <h2
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 88,
            fontWeight: fontWeights.black,
            color: colors.textPrimary,
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          {item.name}
        </h2>
        <p
          style={{
            fontSize: 48,
            fontWeight: fontWeights.semibold,
            color: colors.textSecondary,
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {item.tagline}
        </p>
      </div>

      {/* Code demo — lower 45% of frame */}
      {hasCode && (
        <div
          style={{
            position: 'absolute',
            top: '54%',
            bottom: 160,
            left: 0,
            right: 0,
            overflow: 'hidden',
          }}
        >
          <CodeBlock
            code={item.demoCodeSnippet!.code}
            language={item.demoCodeSnippet!.language}
            themeColor={themeColor}
            animation="fade-in"
          />
        </div>
      )}

      {/* Screenshot — lower 45% of frame */}
      {hasScreenshot && (
        <div
          style={{
            position: 'absolute',
            top: '52%',
            bottom: 160,
            left: 72,
            right: 72,
            overflow: 'hidden',
            borderRadius: radius.xl,
          }}
        >
          <Img
            src={item.screenshotUrl!}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: radius.xl,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── FinalCard ─────────────────────────────────────────────────────────────────

const FinalCard: React.FC<{
  items: ListicleItem[];
  themeColor: string;
}> = ({ items, themeColor }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingTop: 160,
        paddingBottom: 160,
        paddingLeft: 72,
        paddingRight: 72,
        opacity,
      }}
    >
      <h3
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 28,
          fontWeight: fontWeights.bold,
          color: colors.textTertiary,
          margin: '0 0 32px',
          letterSpacing: 4,
          textTransform: 'uppercase',
        }}
      >
        En resumen
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item) => (
          <div
            key={item.rank}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              paddingTop: 22,
              paddingBottom: 22,
              borderBottom: `1px solid ${colors.border}`,
              filter: item.hidden ? 'blur(10px)' : 'none',
            }}
          >
            <span
              style={{
                fontFamily: oxaniumFamily,
                fontSize: 36,
                fontWeight: fontWeights.black,
                color: themeColor,
                minWidth: 60,
              }}
            >
              #{item.rank}
            </span>
            <span
              style={{
                fontFamily: oxaniumFamily,
                fontSize: 48,
                fontWeight: fontWeights.bold,
                color: item.hidden ? colors.textTertiary : colors.textPrimary,
                flex: 1,
              }}
            >
              {item.hidden ? '??????????' : item.name}
            </span>
            {!item.hidden && (
              <span
                style={{
                  fontSize: 40,
                  color: themeColor,
                }}
              >
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ── ListicleTemplate ──────────────────────────────────────────────────────────

export const ListicleTemplate: React.FC<ListicleInput> = (props) => {
  const {
    themeColor,
    audioUrl,
    segments,
    captions,
    musicMood,
    brand,
    listicle,
    totalDurationSec,
  } = props;
  const { fps } = useVideoConfig();
  const tokens = useTokens(themeColor);

  const { items } = listicle;
  const totalItems = items.length;

  const renderContent = (seg: Segment) => {
    if (seg.visualCue === 'listicle-hook') {
      return (
        <HookCard
          text={seg.onScreenText ?? listicle.title}
          themeColor={themeColor}
          variant="punch"
        />
      );
    }

    if (seg.visualCue === 'listicle-setup') {
      return (
        <HookCard
          text={seg.onScreenText ?? seg.voiceover}
          themeColor={themeColor}
          variant="slide"
        />
      );
    }

    if (seg.visualCue.startsWith('listicle-item-')) {
      const rank = parseInt(
        seg.visualCue.replace('listicle-item-', ''),
        10
      );
      const item = items.find((i) => i.rank === rank);
      if (item == null) return null;
      return <ItemCard item={item} themeColor={themeColor} revealed={!item.hidden} />;
    }

    if (seg.visualCue === 'listicle-cliffhanger') {
      const hiddenItem = items.find((i) => i.hidden);
      return (
        <>
          {hiddenItem != null && (
            <ItemCard item={hiddenItem} themeColor={themeColor} revealed={false} />
          )}
          {/* Overlay teaser */}
          <AbsoluteFill
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${tokens.bg}AA`,
            }}
          >
            <HookCard
              text={seg.onScreenText ?? '¿Cuál es la #5?'}
              themeColor={themeColor}
              variant="glitch"
            />
          </AbsoluteFill>
        </>
      );
    }

    if (seg.visualCue === 'listicle-final-card') {
      return <FinalCard items={items} themeColor={themeColor} />;
    }

    if (seg.role === 'cta') {
      return (
        <CtaCard ctaText={seg.voiceover} handle={brand.handle} themeColor={themeColor} />
      );
    }

    return null;
  };

  // Returns the item rank shown in this segment (drives Counter value), or null.
  const itemRankFor = (seg: Segment): number | null => {
    if (seg.visualCue.startsWith('listicle-item-')) {
      return parseInt(seg.visualCue.replace('listicle-item-', ''), 10);
    }
    if (seg.visualCue === 'listicle-cliffhanger') return totalItems;
    return null;
  };

  // Segments that trigger a flash transition on entry (item changes + cliffhanger).
  const flashSegments = segments.filter(
    (seg) =>
      seg.visualCue.startsWith('listicle-item-') ||
      seg.visualCue === 'listicle-cliffhanger'
  );

  return (
    <AbsoluteFill style={{ background: tokens.bg, fontFamily: tokens.fonts.sans }}>
      <VoiceoverAudio url={audioUrl} />
      {musicMood !== undefined && <BackgroundMusic mood={musicMood} volume={0.18} />}

      {segments.map((seg) => {
        const clampedEnd = Math.min(seg.endSec, totalDurationSec);
        const startFrame = Math.round(seg.startSec * fps);
        const durFrames = Math.max(1, Math.round((clampedEnd - seg.startSec) * fps));
        const rank = itemRankFor(seg);

        return (
          <Sequence key={seg.index} from={startFrame} durationInFrames={durFrames}>
            {renderContent(seg)}

            {/* Counter overlay — only for item/cliffhanger segments */}
            {rank != null && (
              <Counter
                current={rank}
                total={totalItems}
                themeColor={themeColor}
                position="top-right"
              />
            )}

            {seg.soundEffect != null && (
              <SoundEffect type={seg.soundEffect} atFrame={0} />
            )}
          </Sequence>
        );
      })}

      {/* Flash transition at each item boundary */}
      {flashSegments.map((seg) => {
        const startFrame = Math.round(seg.startSec * fps);
        return (
          <Sequence key={`flash-${seg.index}`} from={startFrame} durationInFrames={9}>
            <FlashTransition color={themeColor} durationFrames={9} />
          </Sequence>
        );
      })}

      <Captions
        words={captions.words}
        themeColor={themeColor}
        style="highlight-word"
        position="bottom"
      />

      <SafeZones enabled={false} />
    </AbsoluteFill>
  );
};
