import React from 'react';
import { Composition, AbsoluteFill, Sequence } from 'remotion';
import { video, colors } from '@virus/shared';
import { TipTemplate } from '@/templates/tip';
import { tipSchema } from '@/templates/tip/schema';
import { tipDefaults } from '@/templates/tip/defaults';
import { HotTakeTemplate } from '@/templates/hot-take';
import { hotTakeSchema } from '@/templates/hot-take/schema';
import { hotTakeDefaults } from '@/templates/hot-take/defaults';
import { SpeedBuildTemplate } from '@/templates/speed-build';
import { speedBuildSchema } from '@/templates/speed-build/schema';
import { speedBuildDefaults } from '@/templates/speed-build/defaults';
import { ListicleTemplate } from '@/templates/listicle';
import { listicleSchema } from '@/templates/listicle/schema';
import { listicleDefaults } from '@/templates/listicle/defaults';
import { ComparisonTemplate } from '@/templates/comparison';
import { comparisonSchema } from '@/templates/comparison/schema';
import { comparisonDefaults } from '@/templates/comparison/defaults';
import { StoryTemplate } from '@/templates/story';
import { storySchema } from '@/templates/story/schema';
import { storyDefaults } from '@/templates/story/defaults';
import {
  Captions,
  CodeBlock,
  Counter,
  HookCard,
  CtaCard,
  WipeTransition,
  GlitchTransition,
  ZoomPunch,
  FlashTransition,
} from '@/components';

// ── Synthetic demo data ───────────────────────────────────────────────────────

const DEMO_WORDS = [
  { text: 'Esta', startMs: 0, endMs: 400 },
  { text: 'es', startMs: 420, endMs: 700 },
  { text: 'la', startMs: 720, endMs: 900 },
  { text: 'forma', startMs: 920, endMs: 1300 },
  { text: 'más', startMs: 1320, endMs: 1600 },
  { text: 'rápida', startMs: 1620, endMs: 2100 },
  { text: 'de', startMs: 2120, endMs: 2300 },
  { text: 'aprender', startMs: 2320, endMs: 2900 },
  { text: 'React', startMs: 2920, endMs: 3400 },
];

const DEMO_CODE = `const useDebounce = <T>(
  value: T,
  delay: number
): T => {
  const [debounced, setDebounced] =
    useState(value);

  useEffect(() => {
    const id = setTimeout(
      () => setDebounced(value),
      delay
    );
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
};`;

const THEME = '#3ECF8E';
const FPS = video.fps;
const W = video.width;
const H = video.height;

// ── Section label helper ──────────────────────────────────────────────────────

const Label: React.FC<{ top: number; text: string }> = ({ top, text }) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: 20,
      color: colors.textTertiary,
      fontSize: 22,
      fontFamily: 'monospace',
      zIndex: 99,
    }}
  >
    {text}
  </div>
);

// ── Playground: caption styles + code block ───────────────────────────────────

const PlaygroundMain: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.bg }}>
    <Label top={36} text="Captions — highlight-word" />
    <div
      style={{
        position: 'absolute',
        top: 72,
        left: 0,
        right: 0,
        height: 200,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Captions words={DEMO_WORDS} themeColor={THEME} style="highlight-word" position="middle" />
    </div>

    <Label top={290} text="Captions — wipe-line" />
    <div
      style={{
        position: 'absolute',
        top: 326,
        left: 0,
        right: 0,
        height: 200,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Captions words={DEMO_WORDS} themeColor={THEME} style="wipe-line" position="middle" />
    </div>

    <Label top={546} text="Captions — pop-word" />
    <div
      style={{
        position: 'absolute',
        top: 582,
        left: 0,
        right: 0,
        height: 200,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Captions words={DEMO_WORDS} themeColor={THEME} style="pop-word" position="middle" />
    </div>

    <Label top={806} text="CodeBlock — line-by-line + typewriter" />
    <div style={{ position: 'absolute', top: 842, left: 40, right: 40 }}>
      <CodeBlock
        code={DEMO_CODE}
        language="tsx"
        themeColor={THEME}
        animation="line-by-line"
        highlightLines={[1, 2, 3]}
      />
    </div>
  </AbsoluteFill>
);

// ── Counter demo ──────────────────────────────────────────────────────────────

const PlaygroundCounter: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.bg }}>
    <Counter current={3} total={5} themeColor={THEME} position="top-right" />
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.textSecondary,
        fontSize: 48,
        fontFamily: 'sans-serif',
      }}
    >
      Slide 3 / 5
    </AbsoluteFill>
  </AbsoluteFill>
);

// ── HookCard demo — all three variants in sequence ────────────────────────────

const PlaygroundHookCard: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.bg }}>
    <Sequence from={0} durationInFrames={60}>
      <HookCard
        text="¿Sabías que React re-renderiza todo esto?"
        themeColor={THEME}
        variant="punch"
      />
    </Sequence>
    <Sequence from={70} durationInFrames={60}>
      <HookCard
        text="El truco que nadie te enseña sobre hooks"
        themeColor="#FFD400"
        variant="glitch"
      />
    </Sequence>
    <Sequence from={140} durationInFrames={60}>
      <HookCard
        text="Una línea de código que cambia todo"
        themeColor={THEME}
        variant="slide"
      />
    </Sequence>
  </AbsoluteFill>
);

// ── CtaCard demo ──────────────────────────────────────────────────────────────

const PlaygroundCta: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.bg }}>
    <CtaCard
      ctaText="Comentá CURSOR y te mando el setup completo"
      handle="@manunavarro"
      themeColor={THEME}
    />
  </AbsoluteFill>
);

// ── Transitions demo ──────────────────────────────────────────────────────────

const PlaygroundTransitions: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: colors.bgSurface }}>
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.textSecondary,
        fontSize: 64,
        fontFamily: 'sans-serif',
      }}
    >
      Transitions
    </AbsoluteFill>

    <Sequence from={0} durationInFrames={30}>
      <WipeTransition direction="left" durationFrames={30} />
    </Sequence>
    <Sequence from={40} durationInFrames={12}>
      <GlitchTransition durationFrames={12} />
    </Sequence>
    <Sequence from={62} durationInFrames={10}>
      <FlashTransition color="#FFFFFF" durationFrames={10} />
    </Sequence>
    <Sequence from={80} durationInFrames={20}>
      <ZoomPunch scale={1.12} durationFrames={20}>
        <AbsoluteFill
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: THEME,
            fontSize: 80,
            fontFamily: 'sans-serif',
            fontWeight: 900,
          }}
        >
          ZOOM PUNCH
        </AbsoluteFill>
      </ZoomPunch>
    </Sequence>
  </AbsoluteFill>
);

// ── Remotion root (registered in src/index.ts) ────────────────────────────────

export const VirusRoot: React.FC = () => (
  <>
    {/* T3-P02: shared component playground */}
    <Composition
      id="playground"
      component={PlaygroundMain}
      durationInFrames={6 * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{}}
    />
    <Composition
      id="playground-counter"
      component={PlaygroundCounter}
      durationInFrames={3 * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{}}
    />
    <Composition
      id="playground-hook-card"
      component={PlaygroundHookCard}
      durationInFrames={7 * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{}}
    />
    <Composition
      id="playground-cta-card"
      component={PlaygroundCta}
      durationInFrames={4 * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{}}
    />
    <Composition
      id="playground-transitions"
      component={PlaygroundTransitions}
      durationInFrames={4 * FPS}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{}}
    />
    {/* T3-P03: tip template */}
    <Composition
      id="tip"
      component={TipTemplate}
      durationInFrames={Math.round(tipDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={tipSchema}
      defaultProps={tipDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
    {/* T3-P04: hot-take template */}
    <Composition
      id="hot-take"
      component={HotTakeTemplate}
      durationInFrames={Math.round(hotTakeDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={hotTakeSchema}
      defaultProps={hotTakeDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
    {/* T3-P05: speed-build template */}
    <Composition
      id="speed-build"
      component={SpeedBuildTemplate}
      durationInFrames={Math.round(speedBuildDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={speedBuildSchema}
      defaultProps={speedBuildDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
    {/* T3-P06: listicle template */}
    <Composition
      id="listicle"
      component={ListicleTemplate}
      durationInFrames={Math.round(listicleDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={listicleSchema}
      defaultProps={listicleDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
    {/* T3-P07: story/bug-horror template */}
    <Composition
      id="story"
      component={StoryTemplate}
      durationInFrames={Math.round(storyDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={storySchema}
      defaultProps={storyDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
    {/* T3-P08: comparison template */}
    <Composition
      id="comparison"
      component={ComparisonTemplate}
      durationInFrames={Math.round(comparisonDefaults.totalDurationSec * FPS)}
      fps={FPS}
      width={W}
      height={H}
      schema={comparisonSchema}
      defaultProps={comparisonDefaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(props.totalDurationSec * FPS),
      })}
    />
  </>
);
