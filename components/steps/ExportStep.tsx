'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { loadFFmpeg, calculateSceneDurationsFromBeats } from '@/lib/ffmpeg/processor';
import { Card, CardContent, Button, Progress } from '@/components/ui';
import { fetchFile } from '@ffmpeg/util';

export function ExportStep() {
  const {
    scenes,
    bpm,
    beatOffset,
    audioUrl,
    audioFile,
    finalVideoUrl,
    setFinalVideoUrl,
    isExporting,
    setIsExporting,
    exportProgress,
    setExportProgress,
    beatsPerScene,
    setBeatsPerScene,
    aspectRatio,
    beats,
    syncMode,
    audioDuration,
  } = useAppStore();

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoReadyScenes = scenes.filter((s) => s.status === 'video-ready' && s.videoUrl);

  const initFFmpeg = async () => {
    setFfmpegLoading(true);
    setError(null);
    try {
      await loadFFmpeg();
      setFfmpegLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FFmpeg. Please try again.');
      setFfmpegLoaded(false);
    } finally {
      setFfmpegLoading(false);
    }
  };

  useEffect(() => {
    initFFmpeg();
  }, []);

  const handleExport = async () => {
    if (!bpm || videoReadyScenes.length === 0) return;

    setIsExporting(true);
    setError(null);
    setExportProgress(0);

    try {
      const ffmpeg = await loadFFmpeg();
      const totalSteps = videoReadyScenes.length + 3; // +1 for combining, +1 for timing adjustment, +1 for audio
      let currentStep = 0;

      setCurrentTask('Adjusting video speeds...');
      const processedFiles: string[] = [];

      // Calculate durations based on sync mode
      let sceneDurations: number[];

      if (syncMode === 'beat' && beats && beats.length > 0) {
        // Beat tracking mode: variable durations
        sceneDurations = calculateSceneDurationsFromBeats(
          beats,
          beatsPerScene,
          videoReadyScenes.length,
          audioDuration || 0
        );
      } else {
        // BPM mode: constant duration
        const constantDuration = (60 / bpm) * beatsPerScene;
        sceneDurations = videoReadyScenes.map(() => constantDuration);
      }

      for (let i = 0; i < videoReadyScenes.length; i++) {
        const scene = videoReadyScenes[i];
        if (!scene.videoUrl) continue;

        const targetDuration = sceneDurations[i] || (60 / bpm) * beatsPerScene;
        const outputName = `processed_${i}.mp4`;
        const videoData = await fetchFile(scene.videoUrl);
        await ffmpeg.writeFile(`input_${i}.mp4`, videoData);

        // Our videos are 1 second long (we set duration: 1 in grok-imagine-video)
        const originalDuration = 1;
        // pts > 1 = slower (stretch), pts < 1 = faster (compress)
        const pts = targetDuration / originalDuration;

        await ffmpeg.exec([
          '-i', `input_${i}.mp4`,
          '-filter:v', `setpts=${pts.toFixed(4)}*PTS`,
          '-t', targetDuration.toFixed(4), // Explicitly set output duration
          '-an',
          '-y',
          outputName,
        ]);

        processedFiles.push(outputName);
        currentStep++;
        setExportProgress((currentStep / totalSteps) * 100);
      }

      setCurrentTask('Combining videos...');
      const concatContent = processedFiles.map((f) => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatContent);

      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'concatenated_raw.mp4',
      ]);

      // Calculate expected total duration
      const expectedTotalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);

      // Adjust final video to exact duration (fix any FPS drift)
      setCurrentTask('Adjusting timing...');
      await ffmpeg.exec([
        '-i', 'concatenated_raw.mp4',
        '-t', expectedTotalDuration.toFixed(4), // Trim to exact expected duration
        '-c:v', 'libx264', // Re-encode to ensure correct timing
        '-preset', 'fast',
        '-crf', '23',
        '-r', '30', // Set consistent frame rate
        '-y',
        'concatenated.mp4',
      ]);

      currentStep++;
      setExportProgress((currentStep / totalSteps) * 100);

      setCurrentTask('Adding audio...');

      if (audioUrl && audioFile) {
        const audioData = await fetchFile(audioUrl);
        await ffmpeg.writeFile('audio.mp3', audioData);

        // Use beat offset to sync audio with video cuts
        // -ss starts the audio from the first beat
        const audioStartTime = beatOffset > 0 ? beatOffset.toFixed(3) : '0';

        await ffmpeg.exec([
          '-i', 'concatenated.mp4',
          '-ss', audioStartTime, // Start audio from first beat
          '-i', 'audio.mp3',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0', // Use video from first input
          '-map', '1:a:0', // Use audio from second input (after -ss offset)
          '-shortest',
          '-y',
          'final.mp4',
        ]);
      } else {
        await ffmpeg.exec([
          '-i', 'concatenated.mp4',
          '-c', 'copy',
          '-y',
          'final.mp4',
        ]);
      }

      currentStep++;
      setExportProgress(100);

      const finalData = await ffmpeg.readFile('final.mp4');
      const blob = new Blob([finalData as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setFinalVideoUrl(url);
      setCurrentTask('Complete!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setCurrentTask('');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!finalVideoUrl) return;

    const a = document.createElement('a');
    a.href = finalVideoUrl;
    a.download = `music-video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const togglePlayback = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Calculate total duration based on sync mode
  let totalDuration: number;
  let sceneDuration: number;
  if (syncMode === 'beat' && beats && beats.length > 0 && audioDuration) {
    const sceneDurations = calculateSceneDurationsFromBeats(
      beats,
      beatsPerScene,
      videoReadyScenes.length,
      audioDuration
    );
    totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
    sceneDuration = sceneDurations.length > 0 ? sceneDurations[0] : 0;
  } else {
    sceneDuration = bpm ? (60 / bpm) * beatsPerScene : 0;
    totalDuration = sceneDuration * videoReadyScenes.length;
  }

  // Format duration as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="text-center mb-12 animate-slide-up">
        <h2 className="font-display text-5xl md:text-6xl uppercase tracking-wider mb-4">
          <span className="gradient-text">Export Your Video</span>
        </h2>
        <p className="text-[var(--text-secondary)] text-lg max-w-lg mx-auto">
          Sync to BPM, combine clips, and add your audio
        </p>
      </div>

      {/* FFmpeg Loading */}
      {ffmpegLoading && (
        <Card variant="default" className="mb-8 animate-fade-in">
          <CardContent className="flex items-center justify-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-[var(--ink)] border-t-transparent animate-spin" />
            <span className="text-[var(--text-secondary)] font-mono uppercase tracking-wider">Loading video engine...</span>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card variant="red" className="mb-8 animate-fade-in">
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <svg className="w-6 h-6 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[var(--red)]">{error}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={initFFmpeg}
              disabled={ffmpegLoading}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card variant="default" className="mb-8 animate-slide-up">
        <CardContent>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[var(--ink)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--paper)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-display text-xl uppercase tracking-wider text-[var(--ink)]">Export Settings</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="p-4 border-2 border-[var(--red)] shadow-[4px_4px_0_var(--red)] bg-[var(--red-soft)]">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">BPM</p>
              <p className="font-display text-4xl text-[var(--red)]">{bpm || '--'}</p>
            </div>

            <div className="p-4 border-2 border-[var(--cyan)] shadow-[4px_4px_0_var(--cyan)] bg-[var(--cyan-soft)]">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Clips</p>
              <p className="font-display text-4xl text-[var(--cyan)]">{videoReadyScenes.length}</p>
            </div>

            <div className="p-4 border-2 border-[var(--orange)] shadow-[4px_4px_0_var(--orange)] bg-[var(--orange-soft)]">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Sync</p>
              <p className="font-display text-2xl text-[var(--orange)]">
                {syncMode === 'beat' ? 'Beat' : 'BPM'}
              </p>
            </div>

            <div className="p-4 border-2 border-[var(--ink)] shadow-[4px_4px_0_var(--ink)] bg-[var(--paper-dark)]">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Format</p>
              <p className="font-display text-3xl text-[var(--ink)]">{aspectRatio}</p>
            </div>

            <div className="p-4 border-2 border-[var(--ink)] shadow-[4px_4px_0_var(--ink)]">
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
                Beats/Scene
              </label>
              <div className="flex gap-2">
                {([1, 2] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBeatsPerScene(b)}
                    className={`
                      font-display text-3xl px-4 py-1 border-2 transition-all
                      ${beatsPerScene === b
                        ? 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--ink)]'
                        : 'border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--paper-dark)]'
                      }
                    `}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 border-2 border-[var(--yellow)] shadow-[4px_4px_0_var(--yellow)] bg-[var(--yellow-soft)]">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">Duration</p>
              <p className="font-display text-3xl text-[var(--yellow)]">
                {totalDuration > 0 ? formatTime(totalDuration) : '--'}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {totalDuration > 0 ? `${totalDuration.toFixed(1)}s` : ''}
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-[var(--paper-dark)] border-2 border-[var(--ink)]">
            {syncMode === 'beat' && beats ? (
              <>
                <p className="text-sm text-[var(--text-secondary)] font-mono">
                  <span className="text-[var(--cyan)]">{videoReadyScenes.length}</span> scenes synced to
                  <span className="text-[var(--orange)]"> {beats.length}</span> beats =
                  <span className="text-[var(--yellow)]"> {formatTime(totalDuration)}</span> total
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Beat tracking mode: variable scene durations based on actual beat positions
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)] font-mono">
                  <span className="text-[var(--cyan)]">{videoReadyScenes.length}</span> scenes ×
                  <span className="text-[var(--red)]"> {sceneDuration.toFixed(3)}s</span> per scene =
                  <span className="text-[var(--yellow)]"> {formatTime(totalDuration)}</span> total
                </p>
                {bpm && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {bpm} BPM → 1 beat = {(60/bpm).toFixed(3)}s → {beatsPerScene} beat{beatsPerScene > 1 ? 's' : ''} = {sceneDuration.toFixed(3)}s
                  </p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Export Button */}
      <div className="flex justify-center mb-8">
        <Button
          size="lg"
          variant="red"
          onClick={handleExport}
          disabled={!ffmpegLoaded || isExporting || videoReadyScenes.length === 0}
          isLoading={isExporting}
          className="gap-3 px-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {isExporting ? currentTask : 'Create Music Video'}
        </Button>
      </div>

      {/* Progress */}
      {isExporting && (
        <Card variant="default" className="mb-8 animate-fade-in">
          <CardContent>
            <div className="flex justify-between mb-3">
              <span className="text-[var(--text-secondary)] font-mono uppercase tracking-wider">{currentTask}</span>
              <span className="font-mono text-[var(--red)]">{Math.round(exportProgress)}%</span>
            </div>
            <Progress value={exportProgress} variant="red" size="lg" />
          </CardContent>
        </Card>
      )}

      {/* Video Preview */}
      {finalVideoUrl && (
        <Card variant="default" className="animate-scale-in overflow-hidden">
          <div className="relative">
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-[var(--cyan)] z-10">
              <span className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-[var(--ink)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Video Ready
              </span>
            </div>

            <div className="aspect-video bg-[var(--ink)]">
              <video
                ref={videoRef}
                src={finalVideoUrl}
                className="w-full h-full"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            </div>
          </div>

          <CardContent>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button variant="secondary" onClick={togglePlayback} className="gap-2">
                {isPlaying ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </>
                )}
              </Button>

              <Button variant="red" onClick={handleDownload} className="gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Video
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {videoReadyScenes.length === 0 && (
        <Card variant="default">
          <CardContent className="py-16 text-center">
            <svg className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <h3 className="font-display text-2xl uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              No Videos Ready
            </h3>
            <p className="text-[var(--text-muted)]">
              Go back to the Generate step and create some video clips
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
