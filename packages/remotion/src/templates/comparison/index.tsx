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
import { HookCard, Captions, SoundEffect, CtaCard } from '@/components';
import { oxaniumFamily } from '@/lib/fonts';
import type { ComparisonInput } from './schema';

type Tool = ComparisonInput['comparison']['toolA'];
type Round = ComparisonInput['comparison']['rounds'][0];

// ── Background ────────────────────────────────────────────────────────────────

const Background: React.FC<{ colorA: string; colorB: string }> = ({ colorA, colorB }) => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.bg,
      backgroundImage: [
        `radial-gradient(ellipse 55% 70% at 20% 50%, ${colorA}10 0%, transparent 55%)`,
        `radial-gradient(ellipse 55% 70% at 80% 50%, ${colorB}10 0%, transparent 55%)`,
      ].join(', '),
    }}
  />
);

// ── Round Header (score + tool names) ────────────────────────────────────────

const RoundHeader: React.FC<{
  toolA: Tool;
  toolB: Tool;
  scoreA: number;
  scoreB: number;
  scoreRevealFrame: number;
}> = ({ toolA, toolB, scoreA, scoreB, scoreRevealFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const isRevealed = frame >= scoreRevealFrame;
  const updateFrame = Math.max(0, frame - scoreRevealFrame);
  const scoreScale = isRevealed
    ? spring({ fps, frame: updateFrame, config: { damping: 8, stiffness: 380 }, from: 1.4, to: 1 })
    : 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: video.safeTopPx,
        left: 0,
        right: 0,
        height: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 56px',
        opacity: appear,
        zIndex: 10,
      }}
    >
      <span
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 46,
          fontWeight: fontWeights.black,
          color: toolA.color,
          flex: 1,
          letterSpacing: '-0.01em',
        }}
      >
        {toolA.name}
      </span>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          backgroundColor: `${colors.bg}EE`,
          borderRadius: radius.xl,
          padding: '8px 36px',
          border: `2px solid ${colors.border}`,
          transform: `scale(${scoreScale})`,
        }}
      >
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 64,
            fontWeight: fontWeights.black,
            color: toolA.color,
          }}
        >
          {scoreA}
        </span>
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 44,
            fontWeight: fontWeights.semibold,
            color: colors.textTertiary,
          }}
        >
          —
        </span>
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 64,
            fontWeight: fontWeights.black,
            color: toolB.color,
          }}
        >
          {scoreB}
        </span>
      </div>

      <span
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 46,
          fontWeight: fontWeights.black,
          color: toolB.color,
          flex: 1,
          textAlign: 'right',
          letterSpacing: '-0.01em',
        }}
      >
        {toolB.name}
      </span>
    </div>
  );
};

// ── Criteria Setup ────────────────────────────────────────────────────────────

const CriteriaSetup: React.FC<{
  toolA: Tool;
  toolB: Tool;
  rounds: Round[];
}> = ({ toolA, toolB, rounds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 24}px 64px ${video.safeBottomPx + 80}px`,
        gap: 28,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: oxaniumFamily,
          fontSize: 56,
          fontWeight: fontWeights.black,
          color: colors.textPrimary,
          textAlign: 'center',
          opacity: titleOpacity,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        <span style={{ color: toolA.color }}>{toolA.name}</span>
        <span style={{ color: colors.textTertiary }}> vs </span>
        <span style={{ color: toolB.color }}>{toolB.name}</span>
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          width: '100%',
          maxWidth: 820,
        }}
      >
        {rounds.map((round, i) => {
          const delay = (i + 1) * Math.floor(0.2 * fps);
          const lf = Math.max(0, frame - delay);
          const opacity = interpolate(lf, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
          const y = spring({
            fps,
            frame: lf,
            config: { damping: 20, stiffness: 200 },
            from: 24,
            to: 0,
          });

          return (
            <div
              key={i}
              style={{
                opacity,
                transform: `translateY(${y}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                backgroundColor: colors.bgElevated,
                borderRadius: radius.lg,
                padding: '18px 28px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <span
                style={{
                  fontFamily: oxaniumFamily,
                  fontSize: 26,
                  fontWeight: fontWeights.bold,
                  color: colors.textTertiary,
                  minWidth: 36,
                }}
              >
                #{i + 1}
              </span>
              <span
                style={{
                  fontFamily: oxaniumFamily,
                  fontSize: 36,
                  fontWeight: fontWeights.bold,
                  color: colors.textPrimary,
                }}
              >
                {round.title}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── Round Screen ──────────────────────────────────────────────────────────────

const PHASE1_END_SEC = 1.5;
const PHASE2_END_SEC = 4.0;

const RoundScreen: React.FC<{
  round: Round;
  roundIndex: number;
  toolA: Tool;
  toolB: Tool;
  scoreABefore: number;
  scoreBBefore: number;
  durationSec: number;
}> = ({ round, roundIndex, toolA, toolB, scoreABefore, scoreBBefore, durationSec: _durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phase1EndF = Math.floor(PHASE1_END_SEC * fps);
  const phase2EndF = Math.floor(PHASE2_END_SEC * fps);

  const isPhase3 = frame >= phase2EndF;
  const phase3Frame = Math.max(0, frame - phase2EndF);

  const scoreA = isPhase3 && round.winner === 'A' ? scoreABefore + 1 : scoreABefore;
  const scoreB = isPhase3 && round.winner === 'B' ? scoreBBefore + 1 : scoreBBefore;

  // Phase 1 opacity: fade in → hold → fade out as phase 2 begins
  const phase1Opacity = interpolate(
    frame,
    [0, 8, phase1EndF - 6, phase1EndF + 4],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Phase 2: split screen fades in
  const splitOpacity = interpolate(frame, [phase1EndF, phase1EndF + 14], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const dividerLocalFrame = Math.max(0, frame - phase1EndF);
  const dividerScale = spring({
    fps,
    frame: dividerLocalFrame,
    config: { damping: 20, stiffness: 200 },
    from: 0,
    to: 1,
  });

  // Phase 3: winner badge opacity
  const winnerOpacity = interpolate(phase3Frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const renderSide = (isA: boolean) => {
    const tool = isA ? toolA : toolB;
    const result = isA ? round.toolAResult : round.toolBResult;
    const isWinner = round.winner === (isA ? 'A' : 'B');
    const isLoser = round.winner !== 'tie' && !isWinner;
    const isTie = round.winner === 'tie';

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 40px',
          gap: 20,
          opacity: splitOpacity,
        }}
      >
        {/* Tool name */}
        <p
          style={{
            margin: 0,
            fontFamily: oxaniumFamily,
            fontSize: 44,
            fontWeight: fontWeights.black,
            color: isPhase3 && isLoser ? colors.textTertiary : tool.color,
            textAlign: 'center',
            letterSpacing: '-0.01em',
            opacity: isPhase3 && isLoser ? 0.4 : 1,
          }}
        >
          {tool.name}
        </p>

        {/* Result card */}
        <div
          style={{
            backgroundColor:
              isPhase3 && isWinner
                ? `${tool.color}1A`
                : isPhase3 && isLoser
                ? `${colors.bg}88`
                : colors.bgElevated,
            borderRadius: radius.xl,
            padding: '28px 32px',
            border: `2px solid ${
              isPhase3 && isWinner
                ? tool.color
                : isPhase3 && isLoser
                ? `${colors.border}33`
                : colors.border
            }`,
            boxShadow: isPhase3 && isWinner ? shadows.glow(tool.color) : 'none',
            minHeight: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: oxaniumFamily,
              fontSize: 30,
              fontWeight: fontWeights.semibold,
              color: isPhase3 && isLoser ? colors.textTertiary : colors.textPrimary,
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            {result}
          </p>
        </div>

        {/* Winner / loser badge */}
        {isPhase3 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              opacity: winnerOpacity,
            }}
          >
            {(isWinner || isTie) && (
              <div
                style={{
                  backgroundColor: isTie ? colors.bgElevated : tool.color,
                  borderRadius: radius.xl,
                  padding: '10px 28px',
                  fontFamily: oxaniumFamily,
                  fontSize: 30,
                  fontWeight: fontWeights.black,
                  color: isTie ? colors.textSecondary : colors.bg,
                }}
              >
                {isTie ? '= EMPATE' : '✓ GANADOR'}
              </div>
            )}
            {isLoser && (
              <div
                style={{
                  backgroundColor: colors.bgElevated,
                  borderRadius: radius.xl,
                  padding: '10px 28px',
                  fontFamily: oxaniumFamily,
                  fontSize: 30,
                  fontWeight: fontWeights.semibold,
                  color: colors.textTertiary,
                }}
              >
                ✗
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AbsoluteFill>
      {/* Persistent header with live score */}
      <RoundHeader
        toolA={toolA}
        toolB={toolB}
        scoreA={scoreA}
        scoreB={scoreB}
        scoreRevealFrame={phase2EndF}
      />

      {/* Phase 1: task description (full screen, centered) */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `${video.safeTopPx + 130}px 64px ${video.safeBottomPx + 80}px`,
          gap: 24,
          opacity: phase1Opacity,
        }}
      >
        <div
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: '12px 28px',
            border: `1px solid ${colors.border}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: oxaniumFamily,
              fontSize: 26,
              fontWeight: fontWeights.bold,
              color: colors.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Ronda {roundIndex + 1} — {round.title}
          </p>
        </div>

        <p
          style={{
            margin: 0,
            fontFamily: oxaniumFamily,
            fontSize: 54,
            fontWeight: fontWeights.black,
            color: colors.textPrimary,
            textAlign: 'center',
            lineHeight: 1.25,
            maxWidth: 800,
            letterSpacing: '-0.01em',
          }}
        >
          {round.taskDescription}
        </p>
      </AbsoluteFill>

      {/* Phase 2+: split screen */}
      <AbsoluteFill
        style={{
          paddingTop: video.safeTopPx + 120,
          paddingBottom: video.safeBottomPx + 80,
        }}
      >
        <div style={{ display: 'flex', height: '100%' }}>
          {renderSide(true)}

          {/* Animated divider */}
          <div
            style={{
              width: 3,
              backgroundColor: isPhase3
                ? round.winner === 'A'
                  ? toolA.color
                  : round.winner === 'B'
                  ? toolB.color
                  : colors.textSecondary
                : colors.textTertiary,
              opacity: 0.6,
              transform: `scaleY(${dividerScale})`,
              transformOrigin: 'top center',
            }}
          />

          {renderSide(false)}
        </div>
      </AbsoluteFill>

      {/* Ding sound at winner reveal — disabled until SFX files exist in Remotion bundle */}
      {/* {round.winner !== 'tie' && <SoundEffect type="ding" atFrame={phase2EndF} />} */}
    </AbsoluteFill>
  );
};

// ── Final Reveal ──────────────────────────────────────────────────────────────

const FinalReveal: React.FC<{
  toolA: Tool;
  toolB: Tool;
  finalScore: { a: number; b: number };
  overallWinner: 'A' | 'B' | 'tie';
}> = ({ toolA, toolB, finalScore, overallWinner }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerScale = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 250 },
    from: 0.82,
    to: 1,
  });
  const containerOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  const winnerDelay = Math.floor(1.8 * fps);
  const winnerFrame = Math.max(0, frame - winnerDelay);
  const winnerScale = spring({
    fps,
    frame: winnerFrame,
    config: { damping: 10, stiffness: 280 },
    from: 0.65,
    to: 1,
  });
  const winnerOpacity = interpolate(winnerFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  const winnerTool = overallWinner === 'A' ? toolA : overallWinner === 'B' ? toolB : null;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${video.safeTopPx + 24}px 64px ${video.safeBottomPx + 80}px`,
        gap: 48,
        transform: `scale(${containerScale})`,
        opacity: containerOpacity,
      }}
    >
      {/* Score display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 40,
          fontFamily: oxaniumFamily,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 34,
              fontWeight: fontWeights.bold,
              color: colors.textSecondary,
              letterSpacing: '-0.01em',
            }}
          >
            {toolA.name}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 130,
              fontWeight: fontWeights.black,
              color: toolA.color,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {finalScore.a}
          </p>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 80,
            fontWeight: fontWeights.black,
            color: colors.textTertiary,
            lineHeight: 1,
          }}
        >
          —
        </p>

        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 34,
              fontWeight: fontWeights.bold,
              color: colors.textSecondary,
              letterSpacing: '-0.01em',
            }}
          >
            {toolB.name}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 130,
              fontWeight: fontWeights.black,
              color: toolB.color,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {finalScore.b}
          </p>
        </div>
      </div>

      {/* Winner announcement */}
      {winnerTool && (
        <div
          style={{
            backgroundColor: winnerTool.color,
            borderRadius: radius['2xl'],
            padding: '28px 72px',
            transform: `scale(${winnerScale})`,
            opacity: winnerOpacity,
            boxShadow: shadows.glow(winnerTool.color),
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: oxaniumFamily,
              fontSize: 64,
              fontWeight: fontWeights.black,
              color: colors.bg,
              letterSpacing: '-0.01em',
            }}
          >
            🏆 {winnerTool.name}
          </p>
        </div>
      )}

      {overallWinner === 'tie' && (
        <div
          style={{
            borderRadius: radius['2xl'],
            padding: '28px 72px',
            border: `4px solid ${colors.textSecondary}`,
            transform: `scale(${winnerScale})`,
            opacity: winnerOpacity,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: oxaniumFamily,
              fontSize: 64,
              fontWeight: fontWeights.black,
              color: colors.textPrimary,
              letterSpacing: '-0.01em',
            }}
          >
            = EMPATE
          </p>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Main template ─────────────────────────────────────────────────────────────

export const ComparisonTemplate: React.FC<ComparisonInput> = ({
  themeColor,
  segments,
  captions,
  brand,
  comparison,
}) => {
  const { fps } = useVideoConfig();
  const { toolA, toolB, rounds, finalScore, overallWinner } = comparison;

  // Pre-compute cumulative scores BEFORE each round (index 0 = before round 0)
  const cumulativeScores = rounds.reduce<{ a: number; b: number }[]>(
    (acc, round) => {
      const prev = acc[acc.length - 1] ?? { a: 0, b: 0 };
      return [
        ...acc,
        {
          a: prev.a + (round.winner === 'A' ? 1 : 0),
          b: prev.b + (round.winner === 'B' ? 1 : 0),
        },
      ];
    },
    [{ a: 0, b: 0 }]
  );

  const renderSegmentContent = (seg: ComparisonInput['segments'][0]) => {
    if (seg.visualCue === 'hook') {
      return (
        <HookCard
          text={seg.onScreenText ?? seg.voiceover}
          themeColor={themeColor}
          variant="punch"
        />
      );
    }

    if (seg.visualCue === 'criteria') {
      return <CriteriaSetup toolA={toolA} toolB={toolB} rounds={rounds} />;
    }

    if (seg.visualCue.startsWith('round-')) {
      const idx = parseInt(seg.visualCue.replace('round-', ''), 10);
      const round = rounds[idx];
      if (!round) return null;
      const scores = cumulativeScores[idx] ?? { a: 0, b: 0 };
      return (
        <RoundScreen
          round={round}
          roundIndex={idx}
          toolA={toolA}
          toolB={toolB}
          scoreABefore={scores.a}
          scoreBBefore={scores.b}
          durationSec={seg.endSec - seg.startSec}
        />
      );
    }

    if (seg.visualCue === 'final-reveal') {
      return (
        <FinalReveal
          toolA={toolA}
          toolB={toolB}
          finalScore={finalScore}
          overallWinner={overallWinner}
        />
      );
    }

    if (seg.visualCue === 'cta') {
      return (
        <CtaCard
          ctaText={seg.onScreenText ?? seg.voiceover}
          handle={brand.handle}
          themeColor={themeColor}
        />
      );
    }

    return null;
  };

  return (
    <AbsoluteFill>
      <Background colorA={toolA.color} colorB={toolB.color} />

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

      <Captions
        words={captions.words}
        themeColor={themeColor}
        style="highlight-word"
        position="bottom"
      />
    </AbsoluteFill>
  );
};
