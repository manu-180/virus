import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { video, colors, radius, fontWeights } from '@virus/shared';
import { HookCard, Captions, SoundEffect } from '@/components';
import { oxaniumFamily, jetbrainsFamily } from '@/lib/fonts';
import type { StoryInput } from './schema';

const BUG_RED = '#E53E3E';

// ── Cinematic dark background ─────────────────────────────────────────────────

const Background: React.FC<{ themeColor: string }> = ({ themeColor }) => (
  <AbsoluteFill
    style={{
      backgroundColor: '#07070F',
      backgroundImage: `radial-gradient(ellipse 70% 50% at 50% 0%, ${themeColor}0D 0%, transparent 65%)`,
    }}
  />
);

// ── Timeline bar ──────────────────────────────────────────────────────────────
// Persistent horizontal bar at the bottom showing incident events over time.

const TimelineBar: React.FC<{
  events: StoryInput['story']['timelineEvents'];
  totalDurationSec: number;
  themeColor: string;
}> = ({ events, totalDurationSec, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = Math.min(frame / fps / totalDurationSec, 1);
  const opacity = interpolate(frame, [fps * 2.5, fps * 3.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 180,
        left: 64,
        right: 64,
        opacity,
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 3,
          backgroundColor: `${themeColor}22`,
          borderRadius: 2,
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress * 100}%`,
            backgroundColor: themeColor,
            borderRadius: 2,
            boxShadow: `0 0 8px ${themeColor}88`,
          }}
        />

        {/* Event markers */}
        {events.map((ev, i) => {
          const pos = (i + 1) / (events.length + 1);
          const isPast = progress >= pos;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${pos * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: isPast ? themeColor : '#07070F',
                  border: `2px solid ${isPast ? themeColor : `${themeColor}44`}`,
                  boxShadow: isPast ? `0 0 8px ${themeColor}AA` : 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    fontFamily: jetbrainsFamily,
                    fontSize: 18,
                    fontWeight: fontWeights.bold,
                    color: isPast ? themeColor : `${themeColor}44`,
                  }}
                >
                  {ev.time}
                </div>
                <div
                  style={{
                    fontFamily: jetbrainsFamily,
                    fontSize: 15,
                    color: isPast ? colors.textSecondary : `${colors.textSecondary}44`,
                  }}
                >
                  {ev.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Log lines ─────────────────────────────────────────────────────────────────
// Stack trace / log output appearing one line at a time in monospace.

const LogLines: React.FC<{ lines: string[]; themeColor: string }> = ({ lines, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerLine = fps / 1.1;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 40}px 64px ${video.safeBottomPx + 240}px`,
        gap: 10,
      }}
    >
      {lines.map((line, i) => {
        const startFrame = i * framesPerLine;
        if (frame < startFrame) return null;

        const localFrame = frame - startFrame;
        const opacity = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
        const translateX = interpolate(localFrame, [0, 12], [-18, 0], {
          extrapolateRight: 'clamp',
        });

        const isError = /error|fatal|critical/i.test(line);
        const isWarn = /warn/i.test(line);

        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateX(${translateX}px)`,
              fontFamily: jetbrainsFamily,
              fontSize: 27,
              lineHeight: 1.5,
              color: isError ? BUG_RED : isWarn ? '#F6C90E' : colors.textSecondary,
              borderLeft: isError
                ? `3px solid ${BUG_RED}`
                : `3px solid transparent`,
              paddingLeft: 14,
            }}
          >
            {line}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ── Chat message card ─────────────────────────────────────────────────────────

const ChatMessageCard: React.FC<{
  author: string;
  text: string;
  delayFrames: number;
  themeColor: string;
}> = ({ author, text, delayFrames, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < delayFrames) return null;

  const localFrame = frame - delayFrames;
  const opacity = interpolate(localFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const translateY = spring({
    fps,
    frame: localFrame,
    config: { damping: 22, stiffness: 200 },
    from: 24,
    to: 0,
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: '16px 24px',
        borderLeft: `4px solid ${themeColor}`,
        width: '100%',
        maxWidth: 740,
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontFamily: oxaniumFamily,
          fontSize: 22,
          fontWeight: fontWeights.bold,
          color: themeColor,
        }}
      >
        {author}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 34,
          fontWeight: fontWeights.semibold,
          color: colors.textPrimary,
          lineHeight: 1.3,
        }}
      >
        {text}
      </p>
    </div>
  );
};

// ── Chat messages section ─────────────────────────────────────────────────────
// Shows messages timed via atSec relative to the segment start.

const ChatMessages: React.FC<{
  messages: NonNullable<StoryInput['story']['chatMessages']>;
  segStartSec: number;
  themeColor: string;
}> = ({ messages, segStartSec, themeColor }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 40}px 64px ${video.safeBottomPx + 240}px`,
        gap: 20,
      }}
    >
      {messages.map((msg, i) => (
        <ChatMessageCard
          key={i}
          author={msg.author}
          text={msg.text}
          delayFrames={Math.max(0, Math.round((msg.atSec - segStartSec) * fps))}
          themeColor={themeColor}
        />
      ))}
    </AbsoluteFill>
  );
};

// ── Bug reveal ────────────────────────────────────────────────────────────────
// Side-by-side diff: offending line highlighted red (before) / green (after).

const BugReveal: React.FC<{
  bugReveal: StoryInput['story']['bugReveal'];
  themeColor: string;
}> = ({ bugReveal, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const labelScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 240 },
    from: 1.2,
    to: 1,
  });
  const afterOpacity = interpolate(frame, [fps * 2.5, fps * 3.2], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const renderLines = (code: string, isAfter: boolean) =>
    code.split('\n').map((line, i) => {
      const lineNum = i + 1;
      const isOffending = lineNum === bugReveal.offendingLine;
      const bgColor = isOffending
        ? isAfter
          ? `${themeColor}1E`
          : `${BUG_RED}20`
        : 'transparent';
      const borderColor = isOffending ? (isAfter ? themeColor : BUG_RED) : 'transparent';
      const textColor = isOffending ? (isAfter ? themeColor : BUG_RED) : colors.textPrimary;
      const prefix = isOffending ? (isAfter ? '+ ' : '- ') : '  ';

      return (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 42,
            backgroundColor: bgColor,
            borderLeft: `4px solid ${borderColor}`,
          }}
        >
          <span
            style={{
              fontFamily: jetbrainsFamily,
              fontSize: 20,
              color: colors.textSecondary,
              opacity: 0.35,
              minWidth: 34,
              paddingLeft: 8,
              paddingRight: 8,
              userSelect: 'none',
            }}
          >
            {lineNum}
          </span>
          <span
            style={{
              fontFamily: jetbrainsFamily,
              fontSize: 26,
              color: textColor,
              fontWeight: isOffending ? fontWeights.bold : 400,
              whiteSpace: 'pre',
            }}
          >
            {prefix}
            {line}
          </span>
        </div>
      );
    });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 10}px 44px ${video.safeBottomPx + 240}px`,
        gap: 20,
        opacity: containerOpacity,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 56,
          fontWeight: fontWeights.black,
          color: BUG_RED,
          textAlign: 'center',
          transform: `scale(${labelScale})`,
          letterSpacing: '-0.02em',
        }}
      >
        EL BUG
      </p>

      <div style={{ display: 'flex', gap: 20, width: '100%', maxWidth: 880 }}>
        {/* Before panel */}
        <div
          style={{
            flex: 1,
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: '16px 0',
            border: `1px solid ${BUG_RED}44`,
            overflow: 'hidden',
          }}
        >
          <p
            style={{
              margin: '0 16px 10px',
              fontFamily: jetbrainsFamily,
              fontSize: 18,
              color: BUG_RED,
              fontWeight: fontWeights.bold,
              borderBottom: `1px solid ${BUG_RED}28`,
              paddingBottom: 8,
            }}
          >
            ANTES — 3 días en producción
          </p>
          {renderLines(bugReveal.beforeCode, false)}
        </div>

        {/* After panel — delayed reveal */}
        <div
          style={{
            flex: 1,
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: '16px 0',
            border: `1px solid ${themeColor}44`,
            overflow: 'hidden',
            opacity: afterOpacity,
          }}
        >
          <p
            style={{
              margin: '0 16px 10px',
              fontFamily: jetbrainsFamily,
              fontSize: 18,
              color: themeColor,
              fontWeight: fontWeights.bold,
              borderBottom: `1px solid ${themeColor}28`,
              paddingBottom: 8,
            }}
          >
            FIX — 2 caracteres
          </p>
          {renderLines(bugReveal.afterCode, true)}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Lesson + CTA ──────────────────────────────────────────────────────────────

const LessonCta: React.FC<{
  lessonText: string;
  ctaText: string;
  handle: string;
  themeColor: string;
}> = ({ lessonText, ctaText, handle, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerY = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 190 },
    from: 56,
    to: 0,
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 20}px 48px ${video.safeBottomPx + 240}px`,
        gap: 28,
        transform: `translateY(${containerY}px)`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: `${themeColor}0F`,
          border: `1px solid ${themeColor}3C`,
          borderRadius: radius.xl,
          padding: '28px 44px',
          maxWidth: 820,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: '0 0 10px',
            fontFamily: oxaniumFamily,
            fontSize: 22,
            fontWeight: fontWeights.semibold,
            color: themeColor,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Lección
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: oxaniumFamily,
            fontSize: 48,
            fontWeight: fontWeights.black,
            color: colors.textPrimary,
            lineHeight: 1.25,
          }}
        >
          {lessonText}
        </p>
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 36,
          fontWeight: fontWeights.bold,
          color: colors.textSecondary,
          textAlign: 'center',
          maxWidth: 680,
          lineHeight: 1.3,
        }}
      >
        {ctaText}
      </p>

      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 30,
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

export const StoryTemplate: React.FC<StoryInput> = ({
  themeColor,
  segments,
  captions,
  brand,
  totalDurationSec,
  story,
}) => {
  const { fps } = useVideoConfig();

  const renderSegmentContent = (seg: StoryInput['segments'][0]) => {
    const { visualCue } = seg;

    if (visualCue === 'hook-card-slide') {
      return (
        <HookCard
          text={seg.onScreenText ?? seg.voiceover}
          themeColor={themeColor}
          variant="slide"
        />
      );
    }

    if (visualCue === 'log-lines') {
      const raw = seg.codeSnippet?.code ?? seg.onScreenText ?? seg.voiceover;
      return <LogLines lines={raw.split('\n').filter(Boolean)} themeColor={themeColor} />;
    }

    if (visualCue === 'chat-messages') {
      const msgs = (story.chatMessages ?? []).filter(
        (m) => m.atSec >= seg.startSec && m.atSec < seg.endSec
      );
      if (msgs.length === 0) {
        return (
          <HookCard
            text={seg.onScreenText ?? seg.voiceover}
            themeColor={themeColor}
            variant="punch"
          />
        );
      }
      return (
        <ChatMessages messages={msgs} segStartSec={seg.startSec} themeColor={themeColor} />
      );
    }

    if (visualCue === 'bug-reveal') {
      return <BugReveal bugReveal={story.bugReveal} themeColor={themeColor} />;
    }

    if (visualCue === 'cta-lesson') {
      const parts = (seg.onScreenText ?? '').split('|');
      const lessonText = parts[0]?.trim() ?? seg.voiceover;
      const ctaText = parts[1]?.trim() ?? '¿Te pasó algo así? Contame en los comentarios.';
      return (
        <LessonCta
          lessonText={lessonText}
          ctaText={ctaText}
          handle={brand.handle}
          themeColor={themeColor}
        />
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
        return (
          <Sequence key={seg.index} from={from} durationInFrames={duration}>
            <AbsoluteFill>
              {renderSegmentContent(seg)}
              {seg.soundEffect && <SoundEffect type={seg.soundEffect} atFrame={0} />}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Timeline bar: always visible, shows incident timeline progression */}
      <TimelineBar
        events={story.timelineEvents}
        totalDurationSec={totalDurationSec}
        themeColor={themeColor}
      />

      <Captions
        words={captions.words}
        themeColor={themeColor}
        style="wipe-line"
        position="bottom"
      />
    </AbsoluteFill>
  );
};
