'use client';

import { analyze, guess } from 'web-audio-beat-detector';
import { Essentia, EssentiaWASM } from 'essentia.js';

export interface BpmResult {
  bpm: number;
  offset: number; // Time in seconds when first beat occurs
}

export async function detectBpm(audioBuffer: AudioBuffer): Promise<BpmResult> {
  // analyze returns just the BPM number
  const bpm = await analyze(audioBuffer);

  // guess returns more detailed info including offset
  let offset = 0;
  try {
    const guessResult = await guess(audioBuffer);
    // offset is the time of the first beat in seconds
    offset = guessResult.offset || 0;
  } catch {
    // If guess fails, default to 0 offset
    offset = 0;
  }

  return {
    bpm: Math.round(bpm),
    offset: offset,
  };
}

export async function trackBeats(audioBuffer: AudioBuffer): Promise<number[]> {
  const essentia = new Essentia(EssentiaWASM);

  // Convert AudioBuffer to mono Float32Array
  const audioData = audioBuffer.getChannelData(0);
  const audioVector = essentia.arrayToVector(audioData);

  // Run beat tracking algorithm
  const result = essentia.BeatTrackerMultiFeature(audioVector, audioBuffer.sampleRate);
  const beats = essentia.vectorToArray(result.ticks);

  return beats;
}

export async function getAudioBufferFromFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer;
}

export function getAudioDuration(audioBuffer: AudioBuffer): number {
  return audioBuffer.duration;
}

export function calculateBeatDuration(bpm: number): number {
  return 60 / bpm;
}

export function calculateBeatsCount(duration: number, bpm: number): number {
  const beatDuration = calculateBeatDuration(bpm);
  return Math.floor(duration / beatDuration);
}

export function calculateSpeedFactor(originalDuration: number, targetDuration: number): number {
  return originalDuration / targetDuration;
}
