import React from 'react';
import { Audio, staticFile, Sequence } from 'remotion';

export type SfxType = 'whoosh' | 'click' | 'ding' | 'glitch' | 'pop';

export interface SoundEffectProps {
  type: SfxType;
  /** Frame at which the sound should start playing */
  atFrame: number;
  volume?: number;
}

const SFX_FILES: Record<SfxType, string> = {
  whoosh: 'sfx/whoosh.mp3',
  click: 'sfx/click.mp3',
  ding: 'sfx/ding.mp3',
  glitch: 'sfx/glitch.mp3',
  pop: 'sfx/pop.mp3',
};

// Place placeholder .mp3 files at packages/remotion/public/sfx/{name}.mp3
// until real SFX are available.
export const SoundEffect: React.FC<SoundEffectProps> = ({ type, atFrame, volume = 1 }) => {
  return (
    <Sequence from={atFrame} durationInFrames={90} layout="none">
      <Audio src={staticFile(SFX_FILES[type])} startFrom={0} volume={volume} />
    </Sequence>
  );
};
