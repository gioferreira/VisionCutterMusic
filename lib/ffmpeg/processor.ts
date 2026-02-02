'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ClipFittingMode } from '@/stores/app-store';

let ffmpeg: FFmpeg | null = null;

// Check if SharedArrayBuffer is available (multi-threaded FFmpeg)
export function isMultiThreadSupported(): boolean {
  try {
    return typeof SharedArrayBuffer !== 'undefined';
  } catch {
    return false;
  }
}

export async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      onProgress(Math.round(progress * 100));
    }
  });

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  try {
    // Use single-threaded version (works in all browsers without SharedArrayBuffer)
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';

    if (isMultiThreadSupported()) {
      // Multi-threaded version (faster but requires SharedArrayBuffer)
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
    } else {
      // Single-threaded fallback (works everywhere)
      const stBaseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${stBaseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${stBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    }
  } catch (error) {
    console.error('FFmpeg load error:', error);
    ffmpeg = null;
    throw new Error(
      'Failed to load FFmpeg. Please try refreshing the page. ' +
      'If the problem persists, try using Chrome or Firefox.'
    );
  }

  return ffmpeg;
}

export async function adjustVideoSpeed(
  ffmpeg: FFmpeg,
  videoUrl: string,
  speedFactor: number,
  outputName: string
): Promise<Uint8Array> {
  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile('input.mp4', videoData);

  // Adjust video speed using setpts filter
  // speedFactor > 1 means speed up (shorter duration)
  // speedFactor < 1 means slow down (longer duration)
  const pts = 1 / speedFactor;

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-filter:v', `setpts=${pts}*PTS`,
    '-an', // Remove audio from individual clips
    '-y',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return data as Uint8Array;
}

export async function concatenateVideos(
  ffmpeg: FFmpeg,
  videoFiles: string[],
  outputName: string
): Promise<Uint8Array> {
  // Create concat file
  const concatContent = videoFiles.map((f) => `file '${f}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatContent);

  await ffmpeg.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-c', 'copy',
    '-y',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return data as Uint8Array;
}

export async function mergeAudioWithVideo(
  ffmpeg: FFmpeg,
  videoUrl: string,
  audioUrl: string,
  outputName: string
): Promise<Uint8Array> {
  const videoData = await fetchFile(videoUrl);
  const audioData = await fetchFile(audioUrl);

  await ffmpeg.writeFile('video.mp4', videoData);
  await ffmpeg.writeFile('audio.mp3', audioData);

  // Get video duration and trim audio to match
  await ffmpeg.exec([
    '-i', 'video.mp4',
    '-i', 'audio.mp3',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest', // Trim to shortest duration
    '-y',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return data as Uint8Array;
}

export async function processVideoForBpm(
  ffmpeg: FFmpeg,
  videoUrl: string,
  bpm: number,
  beatsPerScene: number,
  outputName: string
): Promise<Uint8Array> {
  const targetDuration = (60 / bpm) * beatsPerScene;

  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile('input.mp4', videoData);

  // Our grok-imagine-video generates 1 second videos
  const originalDuration = 1;
  // pts > 1 = slower (stretch video), pts < 1 = faster (compress video)
  const pts = targetDuration / originalDuration;

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-filter:v', `setpts=${pts}*PTS`,
    '-an',
    '-y',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return data as Uint8Array;
}

export function createBlobUrl(data: Uint8Array, mimeType: string): string {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function calculateSceneDurationsFromBeats(
  beats: number[],
  beatsPerScene: number,
  sceneCount: number,
  audioDuration: number
): number[] {
  const durations: number[] = [];

  for (let i = 0; i < sceneCount; i++) {
    const beatIndex = i * beatsPerScene;
    const startBeat = beats[beatIndex];
    const endBeat = beats[beatIndex + beatsPerScene];

    if (startBeat === undefined) break;

    // If no end beat, use audio duration as fallback
    const duration = endBeat !== undefined
      ? endBeat - startBeat
      : audioDuration - startBeat;

    durations.push(duration);
  }

  return durations;
}

// =============================================================================
// Clip Fitting (Trimming Modes)
// =============================================================================

export interface ClipFittingParams {
  inputFile: string;
  outputFile: string;
  originalDuration: number;
  targetDuration: number;
  mode: ClipFittingMode;
}

/**
 * Apply clip fitting to adjust video duration to target.
 *
 * Modes:
 * - stretch: Adjust playback speed (setpts filter)
 * - crop_head: Keep beginning, trim end
 * - crop_tail: Keep end, trim beginning
 * - crop_center: Keep middle, trim both ends
 *
 * Note: If originalDuration <= targetDuration, always uses stretch
 * (can't crop to make video longer)
 */
export async function applyClipFitting(
  ffmpeg: FFmpeg,
  params: ClipFittingParams
): Promise<void> {
  const { inputFile, outputFile, originalDuration, targetDuration, mode } = params;

  // If original is shorter or equal to target, always stretch to fill
  // (crop modes can't extend video duration)
  if (originalDuration <= targetDuration) {
    const pts = targetDuration / originalDuration;
    await ffmpeg.exec([
      '-i', inputFile,
      '-filter:v', `setpts=${pts.toFixed(6)}*PTS`,
      '-t', targetDuration.toFixed(6),
      '-an',
      '-y',
      outputFile,
    ]);
    return;
  }

  // Original > target: apply selected mode
  switch (mode) {
    case 'stretch': {
      // Adjust speed to fit exactly
      const pts = targetDuration / originalDuration;
      await ffmpeg.exec([
        '-i', inputFile,
        '-filter:v', `setpts=${pts.toFixed(6)}*PTS`,
        '-t', targetDuration.toFixed(6),
        '-an',
        '-y',
        outputFile,
      ]);
      break;
    }

    case 'crop_head': {
      // Keep beginning, trim end
      // Simply limit duration with -t
      await ffmpeg.exec([
        '-i', inputFile,
        '-t', targetDuration.toFixed(6),
        '-c:v', 'copy', // No re-encode needed for simple trim
        '-an',
        '-y',
        outputFile,
      ]);
      break;
    }

    case 'crop_tail': {
      // Keep end, trim beginning
      // Seek to (original - target) then take targetDuration
      const seekTime = originalDuration - targetDuration;
      await ffmpeg.exec([
        '-ss', seekTime.toFixed(6), // Seek before input for fast seeking
        '-i', inputFile,
        '-t', targetDuration.toFixed(6),
        '-c:v', 'copy',
        '-an',
        '-y',
        outputFile,
      ]);
      break;
    }

    case 'crop_center': {
      // Keep middle, trim both ends equally
      const trimAmount = (originalDuration - targetDuration) / 2;
      await ffmpeg.exec([
        '-ss', trimAmount.toFixed(6),
        '-i', inputFile,
        '-t', targetDuration.toFixed(6),
        '-c:v', 'copy',
        '-an',
        '-y',
        outputFile,
      ]);
      break;
    }
  }
}
