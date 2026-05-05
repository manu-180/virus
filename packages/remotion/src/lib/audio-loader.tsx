import React from 'react';
import { Audio, staticFile } from 'remotion';

export const VoiceoverAudio: React.FC<{ url: string }> = ({ url }) => (
  <Audio src={url} />
);

export const BackgroundMusic: React.FC<{ mood: string; volume?: number }> = ({
  mood,
  volume = 0.2,
}) => (
  <Audio src={staticFile(`/music/${mood}.mp3`)} volume={volume} />
);
