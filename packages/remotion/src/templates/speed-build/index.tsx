import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  Img,
} from 'remotion';
import {
  Captions,
  HookCard,
  CtaCard,
  ZoomPunch,
  FlashTransition,
  SoundEffect,
} from '@/components';
import { ScreenRecording } from '@/components/screen-recording';
import { VoiceoverAudio, BackgroundMusic } from '@/lib/audio-loader';
import { SafeZones } from '@/lib/safe-zones';
import { useTokens } from '@/lib/use-tokens';
import type { SpeedBuildInput } from './schema';

// ── Time counter (speedrun clock) ─────────────────────────────────────────────

const TimeCounter: React.FC<{
  startSec: number;
  endSec: number;
  totalFrames: number;
  themeColor: string;
}> = ({ startSec, endSec, totalFrames, themeColor }) => {
  const frame = useCurrentFrame();

  const elapsedSec = interpolate(frame, [0, Math.max(totalFrames - 1, 1)], [startSec, endSec], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const mins = Math.floor(elapsedSec / 60);
  const secs = Math.floor(elapsedSec % 60);
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // Micro-pulse on each second tick
  const subSecond = elapsedSec - Math.floor(elapsedSec);
  const pulse = interpolate(subSecond, [0, 0.08], [1.06, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Slide in from top on entry
  const entryOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const entryY = interpolate(frame, [0, 8], [-20, 0], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
        opacity: entryOpacity,
        transform: `translateY(${entryY}px)`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontSize: 88,
          fontFamily: 'monospace',
          fontWeight: 900,
          color: '#FFFFFF',
          letterSpacing: 6,
          textShadow: `0 0 24px ${themeColor}, 0 0 48px ${themeColor}80`,
          transform: `scale(${pulse})`,
          lineHeight: 1,
        }}
      >
        {display}
      </div>
    </div>
  );
};

// ── Prompt counter ────────────────────────────────────────────────────────────

const PromptCounter: React.FC<{
  scenes: Array<{ durationFrames: number; label?: string }>;
  total: number;
  themeColor: string;
}> = ({ scenes, total, themeColor }) => {
  const frame = useCurrentFrame();

  // Find active scene
  let activeIdx = scenes.length - 1;
  let sceneStartFrame = 0;
  let cumulative = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur = scenes[i]!.durationFrames;
    if (frame < cumulative + dur) {
      activeIdx = i;
      sceneStartFrame = cumulative;
      break;
    }
    cumulative += dur;
  }

  const localFrame = frame - sceneStartFrame;
  const bounceScale = interpolate(localFrame, [0, 6, 10], [1.28, 1.05, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const entryOpacity = interpolate(localFrame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scene = scenes[activeIdx];
  const promptLabel = scene?.label ?? `Prompt ${activeIdx + 1}`;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 168,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: `${themeColor}20`,
          borderRadius: 28,
          border: `2px solid ${themeColor}60`,
          padding: '8px 28px',
          fontSize: 28,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: themeColor,
          transform: `scale(${bounceScale})`,
          opacity: entryOpacity,
          backdropFilter: 'blur(4px)',
          textShadow: `0 0 12px ${themeColor}60`,
        }}
      >
        {promptLabel} / {total}
      </div>
    </div>
  );
};

// ── Final reveal ──────────────────────────────────────────────────────────────

const MockCheckout: React.FC<{ themeColor: string }> = ({ themeColor }) => (
  <div
    style={{
      width: 440,
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: '36px 40px',
      boxShadow: '0 24px 80px #00000070',
      fontFamily: 'system-ui, sans-serif',
    }}
  >
    <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>Pay Manuel Navarro</div>
    <div style={{ fontSize: 52, fontWeight: 900, color: '#111', marginBottom: 28, letterSpacing: -2 }}>
      $97.00
    </div>
    <div
      style={{
        border: '1.5px solid #e0e0e0',
        borderRadius: 8,
        padding: '13px 16px',
        marginBottom: 12,
        color: '#bbb',
        fontSize: 15,
      }}
    >
      4242 4242 4242 4242
    </div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
      {['12 / 26', 'CVC'].map((v) => (
        <div
          key={v}
          style={{
            flex: 1,
            border: '1.5px solid #e0e0e0',
            borderRadius: 8,
            padding: '13px 16px',
            color: '#bbb',
            fontSize: 15,
          }}
        >
          {v}
        </div>
      ))}
    </div>
    <div
      style={{
        backgroundColor: themeColor,
        color: '#fff',
        borderRadius: 8,
        padding: '16px',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: 18,
        letterSpacing: 0.3,
      }}
    >
      Pay $97.00
    </div>
    <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#bbb' }}>
      Powered by{' '}
      <span style={{ color: themeColor, fontWeight: 700 }}>Stripe</span>
    </div>
  </div>
);

const RevealSection: React.FC<{
  screenshotUrl?: string;
  text?: string;
  themeColor: string;
}> = ({ screenshotUrl, text, themeColor }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(frame, [0, 12], [0.88, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {text && (
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: themeColor,
            letterSpacing: 3,
            textTransform: 'uppercase',
            textShadow: `0 0 16px ${themeColor}80`,
          }}
        >
          {text.replace('\n', ' ')}
        </div>
      )}
      {screenshotUrl ? (
        <Img
          src={screenshotUrl}
          style={{
            width: '80%',
            borderRadius: 16,
            border: `3px solid ${themeColor}`,
            boxShadow: `0 0 40px ${themeColor}40`,
          }}
        />
      ) : (
        <MockCheckout themeColor={themeColor} />
      )}
    </AbsoluteFill>
  );
};

// ── Main template ─────────────────────────────────────────────────────────────

export const SpeedBuildTemplate: React.FC<SpeedBuildInput> = (props) => {
  const { themeColor, audioUrl, segments, captions, musicMood, brand, speedBuild, totalDurationSec } =
    props;
  const { fps } = useVideoConfig();
  const tokens = useTokens(themeColor);

  // Subtle radial glow overlay for high-energy feel
  const bgStyle: React.CSSProperties = {
    background: tokens.bg,
    fontFamily: tokens.fonts.sans,
  };

  return (
    <AbsoluteFill style={bgStyle}>
      {/* Radial accent glow from top */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${themeColor}12 0%, transparent 65%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <VoiceoverAudio url={audioUrl} />
      {musicMood !== undefined && <BackgroundMusic mood={musicMood} volume={0.22} />}

      {segments.map((seg) => {
        const clampedEnd = Math.min(seg.endSec, totalDurationSec);
        const startFrame = Math.round(seg.startSec * fps);
        const durFrames = Math.max(1, Math.round((clampedEnd - seg.startSec) * fps));

        return (
          <Sequence key={seg.index} from={startFrame} durationInFrames={durFrames}>
            {/* Hook */}
            {seg.role === 'hook' && (
              <ZoomPunch>
                <HookCard
                  text={seg.onScreenText ?? seg.voiceover}
                  themeColor={themeColor}
                  variant="punch"
                />
              </ZoomPunch>
            )}

            {/* Setup */}
            {seg.role === 'setup' && (
              <HookCard
                text={seg.onScreenText ?? seg.voiceover}
                themeColor={themeColor}
                variant="slide"
              />
            )}

            {/* Development: ScreenRecording + TimeCounter + PromptCounter */}
            {seg.role === 'development' && speedBuild.scenes.length > 0 && (() => {
              // Strip optional `label: undefined` so consumers under
              // exactOptionalPropertyTypes accept the array.
              const cleanScenes = speedBuild.scenes.map((s) => {
                const base = { code: s.code, languageId: s.languageId, durationFrames: s.durationFrames };
                return s.label === undefined ? base : { ...base, label: s.label };
              });
              return (
                <>
                  <ScreenRecording scenes={cleanScenes} themeColor={themeColor} />
                  <TimeCounter
                    startSec={speedBuild.elapsedTimeStartSec}
                    endSec={speedBuild.elapsedTimeEndSec}
                    totalFrames={durFrames}
                    themeColor={themeColor}
                  />
                  <PromptCounter
                    scenes={cleanScenes}
                    total={speedBuild.promptCount}
                    themeColor={themeColor}
                  />
                </>
              );
            })()}

            {/* mini_payoff */}
            {seg.role === 'mini_payoff' && (
              <HookCard
                text={seg.onScreenText ?? seg.voiceover}
                themeColor={themeColor}
                variant="glitch"
              />
            )}

            {/* Reveal */}
            {seg.role === 'reveal' && (
              <RevealSection
                {...(speedBuild.finalScreenshotUrl !== undefined && { screenshotUrl: speedBuild.finalScreenshotUrl })}
                {...(seg.onScreenText !== undefined && { text: seg.onScreenText })}
                themeColor={themeColor}
              />
            )}

            {/* CTA */}
            {seg.role === 'cta' && (
              <CtaCard ctaText={seg.voiceover} handle={brand.handle} themeColor={themeColor} />
            )}

            {seg.soundEffect != null && <SoundEffect type={seg.soundEffect} atFrame={0} />}
          </Sequence>
        );
      })}

      {/* Flash transition at every segment boundary */}
      {segments.slice(1).map((seg) => {
        const startFrame = Math.round(seg.startSec * fps);
        return (
          <Sequence key={`flash-${seg.index}`} from={startFrame} durationInFrames={7}>
            <FlashTransition color={themeColor} durationFrames={7} />
          </Sequence>
        );
      })}

      <Captions
        words={captions.words}
        themeColor={themeColor}
        style="pop-word"
        position="bottom"
      />

      <SafeZones enabled={false} />
    </AbsoluteFill>
  );
};
