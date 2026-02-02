'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/stores/app-store';
import { initFalClient } from '@/lib/fal/client';
import {
  generateImage,
  generateVideo,
  getBackendCostInfo,
  isBackendReady,
  type GenerationConfig,
} from '@/lib/generation';
import type { FrameStrategy } from '@/lib/comfyui/types';
import { Card, CardContent, Button, Progress } from '@/components/ui';

// Default FAL.ai pricing for Grok Imagine (used when backend is FAL)
const DEFAULT_COST_PER_IMAGE = 0.02; // $0.02 per image
const DEFAULT_COST_PER_VIDEO = 0.052; // $0.05 per second + $0.002 for image input = $0.052 for 1s video

// Proxy external URLs, but not data URLs or local URLs
function getProxiedUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('/') || url.startsWith('blob:')) {
    return url;
  }
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

interface SortableImageCardProps {
  scene: {
    id: string;
    prompt: string;
    imageUrl?: string;
    videoUrl?: string;
    status: string;
    error?: string;
  };
  index: number;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onPreview: (type: 'image' | 'video', url: string, prompt: string) => void;
}

function SortableImageCard({
  scene,
  index,
  onRegenerate,
  onDelete,
  onGenerateVideo,
  onPreview,
}: SortableImageCardProps) {
  const [imageError, setImageError] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isGeneratingImage = scene.status === 'generating-image';
  const isGeneratingVideo = scene.status === 'generating-video';
  const hasImage = scene.status !== 'pending' && scene.status !== 'generating-image' && scene.imageUrl && !imageError;
  const hasVideo = scene.status === 'video-ready' && scene.videoUrl;
  const hasError = scene.status === 'error' || imageError;

  return (
    <div ref={setNodeRef} style={style}>
      <Card variant="interactive" className={`group overflow-hidden ${isDragging ? 'border-[var(--red)] shadow-[6px_6px_0_var(--red)]' : ''}`}>
        <div className="aspect-video bg-[var(--paper-dark)] relative overflow-hidden border-b-2 border-[var(--ink)]">
          {scene.imageUrl && !imageError && (
            <img
              src={getProxiedUrl(scene.imageUrl)}
              alt={scene.prompt}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
              onClick={() => {
                if (hasVideo && scene.videoUrl) {
                  onPreview('video', scene.videoUrl, scene.prompt);
                } else if (hasImage && scene.imageUrl) {
                  onPreview('image', scene.imageUrl, scene.prompt);
                }
              }}
              onError={() => {
                console.error('Image failed to load:', scene.imageUrl);
                setImageError(true);
              }}
            />
          )}

          {/* Image load error state */}
          {imageError && scene.imageUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--paper-dark)]">
              <div className="text-center px-4">
                <svg className="w-8 h-8 text-[var(--yellow)] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-[var(--yellow)]">Image expired</p>
                <p className="text-xs text-[var(--text-muted)]">Click regenerate</p>
              </div>
            </div>
          )}

          {hasVideo && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-[var(--ink)]/60 cursor-pointer"
              onClick={() => scene.videoUrl && onPreview('video', scene.videoUrl, scene.prompt)}
            >
              <div className="w-14 h-14 bg-[var(--paper)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--ink)] ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}

          {(isGeneratingImage || isGeneratingVideo) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--paper)]/90">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-[var(--ink)] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                  {isGeneratingImage ? 'Creating...' : 'Animating...'}
                </p>
              </div>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--red-soft)]">
              <div className="text-center px-4">
                <svg className="w-8 h-8 text-[var(--red)] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-[var(--red)] line-clamp-2">{scene.error}</p>
              </div>
            </div>
          )}

          {scene.status === 'pending' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 p-2 bg-[var(--ink)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4 text-[var(--paper)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>

          {/* Scene Number */}
          <div className="absolute top-2 right-2 w-8 h-8 bg-[var(--red)] flex items-center justify-center">
            <span className="font-mono text-xs text-white">{String(index + 1).padStart(2, '0')}</span>
          </div>

          {/* Status Badge */}
          {hasImage && !hasVideo && scene.status === 'image-ready' && (
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-[var(--cyan)] border border-[var(--cyan)]">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--ink)]">Image</span>
            </div>
          )}
          {hasVideo && (
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-[var(--red)] border border-[var(--red)]">
              <span className="text-xs font-mono uppercase tracking-wider text-white">Video</span>
            </div>
          )}
        </div>

        <CardContent className="p-3">
          <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3 min-h-[2.5rem]">
            {scene.prompt}
          </p>

          <div className="flex gap-2">
            {hasImage && !hasVideo && scene.status === 'image-ready' && (
              <Button
                size="sm"
                variant="red"
                onClick={() => onGenerateVideo(scene.id)}
                className="flex-1 text-xs"
              >
                Animate
              </Button>
            )}

            {hasImage && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onRegenerate(scene.id)}
                className="text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(scene.id)}
              className="text-[var(--red)] hover:bg-[var(--red-soft)]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function GenerateStep() {
  const {
    scenes,
    setScenes,
    updateScene,
    deleteScene,
    selectedStyle,
    falApiKey,
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    aspectRatio,
    backendType,
    localApiAddress,
    localConnectionStatus,
    bpm,
    beatsPerScene,
    beats,
    syncMode,
    t2iModel,
    i2vModel,
    workflowMode,
    customT2IMapping,
    customI2VMapping,
    customI2VFps,
    frameStrategy,
    framePadding,
    setFrameStrategy,
    setFramePadding,
  } = useAppStore();

  // Load custom workflows from localStorage if in custom mode
  const customT2IWorkflow = workflowMode === 'custom'
    ? (() => {
        try {
          const json = localStorage.getItem('custom-t2i-workflow');
          return json ? JSON.parse(json) : null;
        } catch { return null; }
      })()
    : null;

  const customI2VWorkflow = workflowMode === 'custom'
    ? (() => {
        try {
          const json = localStorage.getItem('custom-i2v-workflow');
          return json ? JSON.parse(json) : null;
        } catch { return null; }
      })()
    : null;

  // Build generation config from store state
  const generationConfig: GenerationConfig = {
    backendType,
    falApiKey,
    localApiAddress,
    aspectRatio,
    t2iModel,
    i2vModel,
    workflowMode,
    customT2IWorkflow,
    customT2IMapping,
    customI2VWorkflow,
    customI2VMapping,
    customI2VFps,
    frameStrategy,
    framePadding,
  };

  // Get backend-specific cost info
  const costInfo = getBackendCostInfo(backendType);
  const COST_PER_IMAGE = costInfo?.imageCost ?? DEFAULT_COST_PER_IMAGE;
  const COST_PER_VIDEO = costInfo?.videoCost ?? DEFAULT_COST_PER_VIDEO;

  // Check if backend is ready
  const backendReady = isBackendReady(generationConfig);

  // For custom mode, ensure workflows are loaded
  const customWorkflowsReady = workflowMode === 'presets' ||
    (backendType === 'local' && customT2IMapping !== null && customI2VMapping !== null);

  // Calculate target duration for videos based on sync mode
  const getTargetDuration = (sceneIndex: number): number => {
    if (syncMode === 'beat' && beats && beats.length > 0) {
      // Use actual beat positions
      const startBeatIndex = sceneIndex * beatsPerScene;
      const endBeatIndex = startBeatIndex + beatsPerScene;

      if (endBeatIndex < beats.length) {
        return beats[endBeatIndex] - beats[startBeatIndex];
      }
      // For last scene, use average beat duration
      const avgBeatDuration = beats[beats.length - 1] / (beats.length - 1);
      return avgBeatDuration * beatsPerScene;
    }

    // Use BPM-based calculation
    if (bpm) {
      return (60 / bpm) * beatsPerScene;
    }

    // Fallback
    return 1;
  };

  const [showCostConfirm, setShowCostConfirm] = useState<'images' | 'videos' | null>(null);
  const [showAnimatePopup, setShowAnimatePopup] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string; prompt: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (falApiKey) {
      initFalClient(falApiKey);
    }
  }, [falApiKey]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = scenes.findIndex((s) => s.id === active.id);
      const newIndex = scenes.findIndex((s) => s.id === over.id);
      const newScenes = arrayMove(scenes, oldIndex, newIndex);
      setScenes(newScenes);
    }
  };

  const generateSingleImage = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !selectedStyle) return;

    updateScene(sceneId, { status: 'generating-image', error: undefined });

    try {
      const fullPrompt = scene.prompt + selectedStyle.suffix;
      const result = await generateImage(fullPrompt, generationConfig);
      updateScene(sceneId, {
        status: 'image-ready',
        imageUrl: result.imageUrl,
      });
    } catch (error) {
      updateScene(sceneId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Generation failed',
      });
    }
  };

  const generateSingleVideo = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.imageUrl) return;

    const sceneIndex = scenes.findIndex((s) => s.id === sceneId);

    updateScene(sceneId, { status: 'generating-video', error: undefined });

    try {
      // Use scene prompt for motion description
      const motionPrompt = `subtle cinematic motion, gentle camera movement, ${scene.prompt}`;
      // Calculate target duration for this specific scene
      const targetDuration = getTargetDuration(sceneIndex);
      const result = await generateVideo(scene.imageUrl, motionPrompt, generationConfig, targetDuration);
      updateScene(sceneId, {
        status: 'video-ready',
        videoUrl: result.videoUrl,
        generatedDuration: result.generatedDuration, // Store the actual duration
      });
    } catch (error) {
      updateScene(sceneId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Video generation failed',
      });
    }
  };

  // FAL.ai can handle parallel requests, ComfyUI processes sequentially
  const CONCURRENCY_LIMIT = backendType === 'fal' ? 5 : 1;

  // Pool-based concurrency: always keeps CONCURRENCY_LIMIT tasks running
  const runWithPool = async <T,>(
    items: T[],
    task: (item: T) => Promise<void>,
    onProgress: (completed: number, total: number) => void
  ) => {
    let completed = 0;
    let index = 0;
    const total = items.length;

    const runNext = async (): Promise<void> => {
      if (index >= total) return;
      const currentIndex = index++;
      const item = items[currentIndex];
      await task(item);
      completed++;
      onProgress(completed, total);
      await runNext(); // Start next item as soon as this one finishes
    };

    // Start initial pool of concurrent tasks
    const initialTasks = Array(Math.min(CONCURRENCY_LIMIT, total))
      .fill(null)
      .map(() => runNext());

    await Promise.all(initialTasks);
  };

  const generateAllImages = async () => {
    if (!backendReady) return;

    setIsGenerating(true);
    setGenerationProgress(0);

    const pendingScenes = scenes.filter((s) => s.status === 'pending' || s.status === 'error');

    await runWithPool(
      pendingScenes,
      async (scene) => {
        await generateSingleImage(scene.id);
      },
      (completed, total) => {
        setGenerationProgress((completed / total) * 100);
      }
    );

    setIsGenerating(false);

    // Show animate popup if images were generated
    if (pendingScenes.length > 0) {
      setShowAnimatePopup(true);
    }
  };

  const generateAllVideos = async () => {
    if (!backendReady) return;

    setIsGenerating(true);
    setGenerationProgress(0);

    const readyScenes = scenes.filter((s) => s.status === 'image-ready');

    await runWithPool(
      readyScenes,
      async (scene) => {
        await generateSingleVideo(scene.id);
      },
      (completed, total) => {
        setGenerationProgress((completed / total) * 100);
      }
    );

    setIsGenerating(false);
  };

  const pendingCount = scenes.filter((s) => s.status === 'pending' || s.status === 'error').length;
  const imageReadyCount = scenes.filter((s) => s.status === 'image-ready').length;
  const videoReadyCount = scenes.filter((s) => s.status === 'video-ready').length;

  // Cost calculations
  const imageCost = pendingCount * COST_PER_IMAGE;
  const videoCost = imageReadyCount * COST_PER_VIDEO;
  const totalEstimatedCost = (scenes.length * COST_PER_IMAGE) + (scenes.length * COST_PER_VIDEO);

  const handleGenerateImages = () => {
    if (pendingCount > 0) {
      setShowCostConfirm('images');
    }
  };

  const handleGenerateVideos = () => {
    if (imageReadyCount > 0) {
      setShowCostConfirm('videos');
    }
  };

  const confirmGeneration = () => {
    if (showCostConfirm === 'images') {
      generateAllImages();
    } else if (showCostConfirm === 'videos') {
      generateAllVideos();
    }
    setShowCostConfirm(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      <div className="text-center mb-12 animate-slide-up">
        <h2 className="font-display text-5xl md:text-6xl uppercase tracking-wider mb-4">
          <span className="gradient-text">Generate Visuals</span>
        </h2>
        <p className="text-[var(--text-secondary)] text-lg max-w-lg mx-auto">
          Create AI images and animate them into video clips
        </p>
      </div>

      {/* Controls */}
      <Card variant="default" className="mb-8 animate-slide-up">
        <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {backendReady ? (
              <span className={`flex items-center gap-2 text-sm font-mono uppercase tracking-wider ${
                backendType === 'fal' ? 'text-[var(--cyan)]' : 'text-[var(--orange)]'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {backendType === 'fal' ? 'FAL.ai Connected' : 'ComfyUI Ready'}
              </span>
            ) : !customWorkflowsReady ? (
              <span className="text-sm text-[var(--red)] font-mono uppercase tracking-wider">
                Upload both workflows in Audio step
              </span>
            ) : (
              <span className="text-sm text-[var(--red)] font-mono uppercase tracking-wider">
                {backendType === 'fal' ? 'Add API key in Audio step' : 'Connect ComfyUI in Audio step'}
              </span>
            )}

            {/* Free badge for local backend */}
            {backendType === 'local' && backendReady && (
              <span className="px-2 py-1 text-xs font-mono uppercase tracking-wider bg-[var(--cyan)] text-[var(--ink)]">
                Free
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant={backendType === 'fal' ? 'red' : 'orange'}
              onClick={handleGenerateImages}
              disabled={isGenerating || pendingCount === 0 || !backendReady || !customWorkflowsReady}
              isLoading={isGenerating}
              className="gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Generate Images ({pendingCount})
            </Button>

            <Button
              onClick={handleGenerateVideos}
              disabled={isGenerating || imageReadyCount === 0 || !backendReady || !customWorkflowsReady}
              isLoading={isGenerating}
              variant="cyan"
              className="gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Animate All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Model & Cost Info */}
      {backendType === 'fal' ? (
        <Card variant="yellow" className="mb-8 animate-slide-up">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--yellow)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-display text-sm uppercase tracking-wider text-[var(--ink)]">Powered by xAI Grok Imagine</p>
                  <p className="text-xs text-[var(--text-muted)]">Images & videos generated via FAL.ai API</p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Image</p>
                  <p className="font-display text-lg text-[var(--ink)]">${COST_PER_IMAGE.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Video (1s)</p>
                  <p className="font-display text-lg text-[var(--ink)]">${COST_PER_VIDEO.toFixed(2)}</p>
                </div>
                <div className="text-center border-l-2 border-[var(--ink)] pl-6">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Est. Total</p>
                  <p className="font-display text-lg text-[var(--red)]">${totalEstimatedCost.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card variant="cyan" className="mb-8 animate-slide-up">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--cyan)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-display text-sm uppercase tracking-wider text-[var(--ink)]">Self-Hosted ComfyUI</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {workflowMode === 'custom'
                      ? 'Custom workflows (BYOW)'
                      : `${t2iModel === 'flux-klein' ? 'FLUX 2 Klein' : 'Z-Image'} (T2I) + ${i2vModel === 'ltx-2' ? 'LTX-2' : 'Wan2.2'} (I2V)`
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Image</p>
                  <p className="font-display text-lg text-[var(--cyan)]">FREE</p>
                </div>
                <div className="text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Video</p>
                  <p className="font-display text-lg text-[var(--cyan)]">FREE</p>
                </div>
                <div className="text-center border-l-2 border-[var(--ink)] pl-6">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase">Est. Total</p>
                  <p className="font-display text-lg text-[var(--cyan)]">$0.00</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Generation Settings - ComfyUI only */}
      {backendType === 'local' && (
        <Card variant="default" className="mb-8 animate-slide-up">
          <CardContent>
            <details>
              <summary className="cursor-pointer flex items-center gap-3 select-none">
                <div className="w-8 h-8 bg-[var(--ink)] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[var(--paper)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <span className="font-display text-lg uppercase tracking-wider text-[var(--ink)]">
                  Advanced Frame Settings
                </span>
              </summary>

              <div className="mt-6 space-y-6">
                {/* Strategy Selection */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Frame Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'exact', label: 'Exact Match', desc: 'Precise frame count' },
                      { value: 'round_second', label: 'Round to Second', desc: 'Ensures full coverage' },
                      { value: 'padding', label: 'Add Padding', desc: 'Extra safety frames' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setFrameStrategy(option.value as FrameStrategy)}
                        className={`
                          p-3 border-2 text-left transition-all
                          ${frameStrategy === option.value
                            ? 'border-[var(--cyan)] bg-[var(--cyan-soft)]'
                            : 'border-[var(--ink)] hover:border-[var(--cyan)]'
                          }
                        `}
                      >
                        <p className={`font-mono text-sm uppercase tracking-wider ${frameStrategy === option.value ? 'text-[var(--cyan)]' : 'text-[var(--text-primary)]'}`}>
                          {option.label}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{option.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Padding Input - only show when padding strategy selected */}
                {frameStrategy === 'padding' && (
                  <div className="animate-fade-in">
                    <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">
                      Extra Frames
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={framePadding}
                        onChange={(e) => setFramePadding(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-24 px-3 py-2 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--text-primary)] font-mono text-lg focus:outline-none focus:border-[var(--cyan)]"
                      />
                      <span className="text-sm text-[var(--text-muted)]">
                        frames added to each video
                      </span>
                    </div>
                  </div>
                )}

                {/* Strategy explanation */}
                <div className="p-3 bg-[var(--paper-dark)] border-2 border-[var(--ink)] text-xs text-[var(--text-muted)]">
                  {frameStrategy === 'exact' && (
                    <p>Generates exactly the frames needed for beat duration. Best for tight sync.</p>
                  )}
                  {frameStrategy === 'round_second' && (
                    <p>Rounds up to the nearest full second. Useful for ensuring no audio gaps.</p>
                  )}
                  {frameStrategy === 'padding' && (
                    <p>Adds {framePadding} extra frames as a safety buffer for smoother transitions.</p>
                  )}
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* FAL.ai Frame Control Notice */}
      {backendType === 'fal' && (
        <div className="mb-8 p-3 bg-[var(--paper-dark)] border-2 border-[var(--ink)] text-xs text-[var(--text-muted)]">
          <span className="text-[var(--yellow)]">Note:</span> Frame-level control is only available with ComfyUI backend. FAL.ai generates 1-second videos that are stretched/compressed at export.
        </div>
      )}

      {/* Cost Confirmation Modal */}
      {showCostConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[var(--ink)]/80"
            onClick={() => setShowCostConfirm(null)}
          />

          <div className="relative w-full max-w-md bg-[var(--paper)] border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--ink)] animate-scale-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 flex items-center justify-center ${
                  backendType === 'fal' ? 'bg-[var(--yellow)]' : 'bg-[var(--cyan)]'
                }`}>
                  {backendType === 'fal' ? (
                    <svg className="w-6 h-6 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="font-display text-2xl uppercase tracking-wider text-[var(--ink)]">
                    Confirm Generation
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    {backendType === 'fal' ? 'This will use your FAL.ai credits' : 'Running on your local ComfyUI'}
                  </p>
                </div>
              </div>

              <div className="bg-[var(--paper-dark)] border-2 border-[var(--ink)] p-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-mono text-sm uppercase tracking-wider text-[var(--text-secondary)]">
                    {showCostConfirm === 'images' ? 'Images to generate' : 'Videos to create'}
                  </span>
                  <span className="font-display text-2xl text-[var(--ink)]">
                    {showCostConfirm === 'images' ? pendingCount : imageReadyCount}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-[var(--ink)]">
                  <span className="font-mono text-sm uppercase tracking-wider text-[var(--text-secondary)]">
                    {backendType === 'fal' ? 'Estimated cost' : 'Cost'}
                  </span>
                  <span className={`font-display text-3xl ${backendType === 'fal' ? 'text-[var(--red)]' : 'text-[var(--cyan)]'}`}>
                    {backendType === 'fal'
                      ? `$${showCostConfirm === 'images' ? imageCost.toFixed(2) : videoCost.toFixed(2)}`
                      : 'FREE'
                    }
                  </span>
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)] mb-6 text-center">
                {backendType === 'fal' ? (
                  <>Using <span className="font-mono text-[var(--ink)]">xai/grok-imagine{showCostConfirm === 'videos' ? '-video' : ''}</span> model via FAL.ai</>
                ) : (
                  <>Using <span className="font-mono text-[var(--ink)]">{showCostConfirm === 'images' ? (t2iModel === 'flux-klein' ? 'FLUX 2 Klein' : 'Z-Image') : (i2vModel === 'ltx-2' ? 'LTX-2' : 'Wan2.2')}</span> on local ComfyUI</>
                )}
              </p>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowCostConfirm(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant={backendType === 'fal' ? 'red' : 'orange'}
                  onClick={confirmGeneration}
                  className="flex-1"
                >
                  Generate Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animate All Popup - Shows after images are generated */}
      {showAnimatePopup && imageReadyCount > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[var(--ink)]/80"
            onClick={() => setShowAnimatePopup(false)}
          />

          <div className={`relative w-full max-w-lg bg-[var(--paper)] border-2 border-[var(--ink)] animate-scale-in ${
            backendType === 'fal' ? 'shadow-[8px_8px_0_var(--red)]' : 'shadow-[8px_8px_0_var(--orange)]'
          }`}>
            <div className="p-8 text-center">
              {/* Success Icon */}
              <div className="w-20 h-20 bg-[var(--cyan)] mx-auto mb-6 flex items-center justify-center">
                <svg className="w-10 h-10 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h3 className="font-display text-4xl uppercase tracking-wider text-[var(--ink)] mb-2">
                Images Ready!
              </h3>
              <p className="text-lg text-[var(--text-secondary)] mb-2">
                <span className="font-display text-3xl text-[var(--cyan)]">{imageReadyCount}</span> images generated successfully
              </p>
              <p className="text-sm text-[var(--text-muted)] mb-8">
                Ready to bring them to life?
              </p>

              {/* Cost Preview */}
              <div className="bg-[var(--paper-dark)] border-2 border-[var(--ink)] p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-sm uppercase tracking-wider text-[var(--text-secondary)]">
                    {backendType === 'fal' ? `Estimated cost for ${imageReadyCount} videos` : `Generate ${imageReadyCount} videos`}
                  </span>
                  <span className={`font-display text-2xl ${backendType === 'fal' ? 'text-[var(--red)]' : 'text-[var(--cyan)]'}`}>
                    {backendType === 'fal' ? `$${videoCost.toFixed(2)}` : 'FREE'}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  variant="ghost"
                  onClick={() => setShowAnimatePopup(false)}
                  className="flex-1"
                >
                  Maybe Later
                </Button>
                <Button
                  variant={backendType === 'fal' ? 'red' : 'orange'}
                  onClick={() => {
                    setShowAnimatePopup(false);
                    setShowCostConfirm('videos');
                  }}
                  className="flex-1 gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Animate All
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[var(--ink)]/90"
            onClick={() => setPreviewMedia(null)}
          />

          <div className="relative w-full max-w-5xl animate-scale-in">
            {/* Close Button */}
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute -top-12 right-0 w-10 h-10 bg-[var(--paper)] border-2 border-[var(--ink)] flex items-center justify-center hover:bg-[var(--red)] hover:text-white transition-colors z-10"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Media Container */}
            <div className="bg-[var(--ink)] border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--red)]">
              {previewMedia.type === 'image' ? (
                <img
                  src={getProxiedUrl(previewMedia.url)}
                  alt={previewMedia.prompt}
                  className="w-full h-auto max-h-[75vh] object-contain"
                />
              ) : (
                <video
                  src={getProxiedUrl(previewMedia.url)}
                  controls
                  autoPlay
                  loop
                  className="w-full h-auto max-h-[75vh] object-contain"
                />
              )}
            </div>

            {/* Caption */}
            <div className="mt-4 bg-[var(--paper)] border-2 border-[var(--ink)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 text-xs font-mono uppercase tracking-wider ${
                  previewMedia.type === 'video'
                    ? 'bg-[var(--red)] text-white'
                    : 'bg-[var(--cyan)] text-[var(--ink)]'
                }`}>
                  {previewMedia.type}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                {previewMedia.prompt}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {isGenerating && (
        <div className="mb-8 animate-fade-in">
          <Progress value={generationProgress} variant="red" showLabel size="lg" />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
        <Card variant="default">
          <CardContent className="py-4 text-center">
            <p className="font-display text-4xl md:text-5xl text-[var(--text-muted)]">{pendingCount}</p>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Pending</p>
          </CardContent>
        </Card>
        <Card variant="cyan">
          <CardContent className="py-4 text-center">
            <p className="font-display text-4xl md:text-5xl text-[var(--cyan)]">{imageReadyCount}</p>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Images</p>
          </CardContent>
        </Card>
        <Card variant="red">
          <CardContent className="py-4 text-center">
            <p className="font-display text-4xl md:text-5xl text-[var(--red)]">{videoReadyCount}</p>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Videos</p>
          </CardContent>
        </Card>
      </div>

      {/* Scene Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {scenes.map((scene, index) => (
              <SortableImageCard
                key={scene.id}
                scene={scene}
                index={index}
                onRegenerate={generateSingleImage}
                onDelete={deleteScene}
                onGenerateVideo={generateSingleVideo}
                onPreview={(type, url, prompt) => setPreviewMedia({ type, url, prompt })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {scenes.length === 0 && (
        <Card variant="default">
          <CardContent className="py-16 text-center">
            <svg className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-[var(--text-muted)] font-mono uppercase tracking-wider">No scenes to generate</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Go back and add some scenes</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
