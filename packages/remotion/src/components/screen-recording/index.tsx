import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { radius } from '@virus/shared';
import { jetbrainsFamily } from '@/lib/fonts';

export interface ScreenRecordingProps {
  scenes: Array<{
    code: string;
    languageId: string;
    durationFrames: number;
    label?: string;
  }>;
  themeColor: string;
}

const codeTheme = {
  ...themes.nightOwl,
  plain: {
    backgroundColor: '#0d1117',
    color: '#c9d1d9',
  },
};

const TRAFFIC_LIGHTS = ['#FF5F57', '#FFBD2E', '#28C840'] as const;

export const ScreenRecording: React.FC<ScreenRecordingProps> = ({ scenes, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps: _fps } = useVideoConfig();

  // Determine active scene index and local frame offset
  let sceneIndex = scenes.length - 1;
  let sceneFrame = 0;
  let cumulative = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur = scenes[i]!.durationFrames;
    if (frame < cumulative + dur) {
      sceneIndex = i;
      sceneFrame = frame - cumulative;
      break;
    }
    cumulative += dur;
  }
  // If frame exceeds all scene durations, stay on last scene
  if (frame >= cumulative) {
    sceneIndex = scenes.length - 1;
    sceneFrame = frame - (cumulative - (scenes[scenes.length - 1]?.durationFrames ?? 0));
  }

  const scene = scenes[sceneIndex];
  if (!scene) return null;

  // Fade in on scene entry
  const sceneOpacity = interpolate(sceneFrame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fast typewriter: full code visible in first 35% of scene
  const totalChars = scene.code.length;
  const typewriterFrames = Math.max(10, Math.round(scene.durationFrames * 0.35));
  const visibleChars = Math.floor(
    interpolate(sceneFrame, [0, typewriterFrames], [0, totalChars], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const visibleCode = scene.code.slice(0, Math.max(visibleChars, 1));

  // Cursor blink every 8 frames
  const cursorVisible = Math.floor(frame / 8) % 2 === 0;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: sceneOpacity,
      }}
    >
      <div
        style={{
          width: '88%',
          maxWidth: 820,
          borderRadius: radius.lg,
          overflow: 'hidden',
          boxShadow: `0 0 40px ${themeColor}28, 0 20px 70px #00000070`,
          border: `1px solid ${themeColor}35`,
        }}
      >
        {/* macOS-style title bar */}
        <div
          style={{
            height: 42,
            backgroundColor: '#1a1d23',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 8,
            borderBottom: '1px solid #2a2d35',
          }}
        >
          {TRAFFIC_LIGHTS.map((c, i) => (
            <div
              key={i}
              style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: c }}
            />
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: '#888',
              fontFamily: 'monospace',
              letterSpacing: 0.5,
            }}
          >
            {scene.label ?? `scene-${sceneIndex + 1}.tsx`}
          </span>
        </div>

        {/* Code content */}
        <div style={{ backgroundColor: '#0d1117', padding: '24px 28px 32px', minHeight: 280 }}>
          <Highlight theme={codeTheme} code={visibleCode} language={scene.languageId as Language}>
            {({ style, tokens: prismTokens, getLineProps, getTokenProps }) => (
              <pre
                style={{
                  ...style,
                  fontFamily: jetbrainsFamily,
                  fontSize: 21,
                  lineHeight: 1.65,
                  margin: 0,
                  padding: 0,
                  background: 'transparent',
                  overflowX: 'hidden',
                }}
              >
                {prismTokens.map((line, lineIdx) => (
                  <div key={lineIdx} {...getLineProps({ line })}>
                    {line.map((token, tokenIdx) => (
                      <span key={tokenIdx} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: 21,
                    backgroundColor: themeColor,
                    marginLeft: 1,
                    verticalAlign: 'text-bottom',
                    opacity: cursorVisible ? 1 : 0,
                  }}
                />
              </pre>
            )}
          </Highlight>
        </div>
      </div>
    </div>
  );
};
