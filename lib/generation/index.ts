'use client';

import type { AspectRatio, BackendType, T2IModel, I2VModel, WorkflowMode } from '@/stores/app-store';
import { initFalClient, generateImage as falGenerateImage, generateVideo as falGenerateVideo } from '@/lib/fal/client';
import { getComfyUIClient, initComfyUIClient } from '@/lib/comfyui/client';
import {
  hydrateT2IWorkflow,
  hydrateI2VWorkflow,
  hydrateCustomT2IWorkflow,
  hydrateCustomI2VWorkflow,
  getImageDimensions,
} from '@/lib/comfyui/workflows';
import type { GenerationProgress, ComfyUIWorkflow, T2IWorkflowMapping, I2VWorkflowMapping } from '@/lib/comfyui/types';

export interface GenerationConfig {
  backendType: BackendType;
  falApiKey?: string | null;
  localApiAddress?: string;
  aspectRatio: AspectRatio;
  t2iModel?: T2IModel;
  i2vModel?: I2VModel;
  // BYOW additions
  workflowMode?: WorkflowMode;
  customT2IWorkflow?: ComfyUIWorkflow | null;
  customT2IMapping?: T2IWorkflowMapping | null;
  customI2VWorkflow?: ComfyUIWorkflow | null;
  customI2VMapping?: I2VWorkflowMapping | null;
  customI2VFps?: number;
}

export interface T2IResult {
  imageUrl: string;
}

export interface I2VResult {
  videoUrl: string;
}

/**
 * Generate an image using the selected backend
 */
export async function generateImage(
  prompt: string,
  config: GenerationConfig,
  onProgress?: (progress: number) => void
): Promise<T2IResult> {
  if (config.backendType === 'fal') {
    return generateImageWithFal(prompt, config, onProgress);
  } else {
    return generateImageWithComfyUI(prompt, config, onProgress);
  }
}

/**
 * Generate a video from an image using the selected backend
 * @param imageUrl URL of the source image
 * @param motionPrompt Description of desired motion
 * @param config Generation configuration
 * @param targetDuration Target video duration in seconds (used by ComfyUI, ignored by FAL)
 * @param onProgress Progress callback
 */
export async function generateVideo(
  imageUrl: string,
  motionPrompt: string,
  config: GenerationConfig,
  targetDuration: number = 1,
  onProgress?: (progress: number) => void
): Promise<I2VResult> {
  if (config.backendType === 'fal') {
    return generateVideoWithFal(imageUrl, motionPrompt, config, onProgress);
  } else {
    return generateVideoWithComfyUI(imageUrl, motionPrompt, config, targetDuration, onProgress);
  }
}

// ============================================================================
// FAL.ai Backend
// ============================================================================

async function generateImageWithFal(
  prompt: string,
  config: GenerationConfig,
  onProgress?: (progress: number) => void
): Promise<T2IResult> {
  if (!config.falApiKey) {
    throw new Error('FAL API key is required');
  }

  initFalClient(config.falApiKey);
  const result = await falGenerateImage(prompt, config.aspectRatio, onProgress);
  return { imageUrl: result.imageUrl };
}

async function generateVideoWithFal(
  imageUrl: string,
  motionPrompt: string,
  config: GenerationConfig,
  onProgress?: (progress: number) => void
): Promise<I2VResult> {
  if (!config.falApiKey) {
    throw new Error('FAL API key is required');
  }

  initFalClient(config.falApiKey);
  const result = await falGenerateVideo(imageUrl, motionPrompt, onProgress);
  return { videoUrl: result.videoUrl };
}

// ============================================================================
// ComfyUI Backend
// ============================================================================

async function generateImageWithComfyUI(
  prompt: string,
  config: GenerationConfig,
  onProgress?: (progress: number) => void
): Promise<T2IResult> {
  if (!config.localApiAddress) {
    throw new Error('Local API address is required');
  }

  // Get or create client (don't reset existing client)
  let client: ReturnType<typeof getComfyUIClient>;
  try {
    client = getComfyUIClient();
    // Update address if changed
    if (client.address !== config.localApiAddress.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')) {
      client = initComfyUIClient(config.localApiAddress);
    }
  } catch {
    client = initComfyUIClient(config.localApiAddress);
  }

  // Ensure WebSocket connection
  if (client.status !== 'connected') {
    await client.connect();
  }

  // Hydrate the workflow based on mode
  let workflow: ComfyUIWorkflow;

  if (config.workflowMode === 'custom' && config.customT2IWorkflow && config.customT2IMapping) {
    const { width, height } = getImageDimensions(config.aspectRatio);
    workflow = hydrateCustomT2IWorkflow({
      prompt,
      negativePrompt: 'blurry, low quality, distorted, watermark',
      width,
      height,
      workflow: config.customT2IWorkflow,
      mapping: config.customT2IMapping,
    });
    console.log('[ComfyUI] Using custom T2I workflow');
  } else {
    workflow = hydrateT2IWorkflow({
      prompt,
      aspectRatio: config.aspectRatio,
      model: config.t2iModel || 'flux-klein',
    });
    console.log('[ComfyUI] Using preset T2I workflow:', config.t2iModel || 'flux-klein');
  }

  console.log('[ComfyUI] Queuing T2I prompt...');

  // Queue the prompt
  const { prompt_id } = await client.queuePrompt(workflow);
  console.log('[ComfyUI] Prompt queued:', prompt_id);

  // Wait for completion
  const progressHandler = (progress: GenerationProgress) => {
    onProgress?.(progress.progress);
  };

  const result = await client.waitForCompletion(prompt_id, progressHandler);

  if (result.images.length === 0) {
    throw new Error('No image generated');
  }

  // Get the output image
  const output = result.images[0];
  console.log('[ComfyUI] Image output:', output);

  // Fetch the image and convert to data URL for reliability
  const imageUrl = await client.fetchOutputAsDataUrl(output.filename, output.subfolder, output.type);
  console.log('[ComfyUI] Image data URL created, length:', imageUrl.length);

  return { imageUrl };
}

async function generateVideoWithComfyUI(
  imageUrl: string,
  motionPrompt: string,
  config: GenerationConfig,
  targetDuration: number,
  onProgress?: (progress: number) => void
): Promise<I2VResult> {
  if (!config.localApiAddress) {
    throw new Error('Local API address is required');
  }

  // Get or create client (don't reset existing client)
  let client: ReturnType<typeof getComfyUIClient>;
  try {
    client = getComfyUIClient();
    // Update address if changed
    if (client.address !== config.localApiAddress.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')) {
      client = initComfyUIClient(config.localApiAddress);
    }
  } catch {
    client = initComfyUIClient(config.localApiAddress);
  }

  // Ensure WebSocket connection
  if (client.status !== 'connected') {
    await client.connect();
  }

  // Download the image and upload to ComfyUI
  console.log('[ComfyUI] Fetching source image...');
  const imageBlob = await client.fetchImageAsBlob(imageUrl);

  // Generate a unique filename
  const timestamp = Date.now();
  const filename = `input_${timestamp}.png`;

  console.log('[ComfyUI] Uploading image to ComfyUI...');
  // Upload to the default input folder (no subfolder)
  const uploadResult = await client.uploadImage(imageBlob, filename, '', true);
  console.log('[ComfyUI] Image uploaded:', JSON.stringify(uploadResult));

  // Hydrate the workflow based on mode
  let workflow: ComfyUIWorkflow;

  if (config.workflowMode === 'custom' && config.customI2VWorkflow && config.customI2VMapping) {
    const fps = config.customI2VFps || 24;
    const frames = Math.round(targetDuration * fps) + 1;
    const { width, height } = getImageDimensions(config.aspectRatio);

    workflow = hydrateCustomI2VWorkflow({
      inputImageFilename: uploadResult.name,
      motionPrompt,
      negativePrompt: 'blurry, distorted, low quality',
      frames,
      width,
      height,
      workflow: config.customI2VWorkflow,
      mapping: config.customI2VMapping,
    });
    console.log(`[ComfyUI] Using custom I2V workflow: ${targetDuration}s -> ${frames} frames @ ${fps}fps`);
  } else {
    const i2vParams = {
      inputImageFilename: uploadResult.name,
      motionPrompt,
      targetDuration,
      model: config.i2vModel || 'ltx-2',
      aspectRatio: config.aspectRatio,
    };
    console.log('[ComfyUI] I2V params:', i2vParams);
    workflow = hydrateI2VWorkflow(i2vParams);
    console.log('[ComfyUI] Using preset I2V workflow:', config.i2vModel || 'ltx-2');
  }

  console.log('[ComfyUI] Queuing I2V prompt...');

  // Queue the prompt
  const { prompt_id } = await client.queuePrompt(workflow);
  console.log('[ComfyUI] Prompt queued:', prompt_id);

  // Wait for completion
  const progressHandler = (progress: GenerationProgress) => {
    onProgress?.(progress.progress);
  };

  const result = await client.waitForCompletion(prompt_id, progressHandler);

  if (result.videos.length === 0) {
    throw new Error('No video generated');
  }

  // Get the output video
  const output = result.videos[0];
  console.log('[ComfyUI] Video output:', output);

  // Fetch the video and convert to data URL for reliability
  const videoUrl = await client.fetchOutputAsDataUrl(output.filename, output.subfolder, output.type);
  console.log('[ComfyUI] Video data URL created, length:', videoUrl.length);

  return { videoUrl };
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if the current backend is ready for generation
 */
export function isBackendReady(config: GenerationConfig): boolean {
  if (config.backendType === 'fal') {
    return !!config.falApiKey;
  } else {
    return !!config.localApiAddress;
  }
}

/**
 * Get backend-specific cost info (FAL.ai only)
 */
export function getBackendCostInfo(backendType: BackendType): { imageCost: number; videoCost: number } | null {
  if (backendType === 'fal') {
    return {
      imageCost: 0.02,  // $0.02 per image
      videoCost: 0.052, // $0.05 per second + $0.002 for image input
    };
  }
  // ComfyUI is free (self-hosted)
  return null;
}
