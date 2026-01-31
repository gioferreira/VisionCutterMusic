'use client';

import type { ComfyUIWorkflow } from './types';
import type { AspectRatio } from '@/stores/app-store';

// Import workflow templates
import t2iWorkflowTemplate from '@/workflows/t2i_workflow_api.json';
import i2vWorkflowTemplate from '@/workflows/i2v_workflow_api.json';

// T2I Node IDs for FLUX 2 Klein workflow
const T2I_NODES = {
  POSITIVE_PROMPT: '76',      // PrimitiveStringMultiline - inputs.value
  NEGATIVE_PROMPT: '75:67',   // CLIPTextEncode - inputs.text
  SEED: '75:73',              // RandomNoise - inputs.noise_seed
  WIDTH: '75:68',             // PrimitiveInt - inputs.value
  HEIGHT: '75:69',            // PrimitiveInt - inputs.value
};

// I2V Node IDs for LTX-2 workflow
const I2V_NODES = {
  INPUT_IMAGE: '98',          // LoadImage - inputs.image
  POSITIVE_PROMPT: '92:3',    // CLIPTextEncode - inputs.text
  NEGATIVE_PROMPT: '92:4',    // CLIPTextEncode - inputs.text (has good defaults)
  SEED: '92:11',              // RandomNoise - inputs.noise_seed
  FRAMES: '92:62',            // PrimitiveInt - inputs.value
};

// LTX-2 frame rate
const LTX_FPS = 25;

/**
 * Get pixel dimensions for aspect ratio
 * Returns dimensions that work well with FLUX 2 Klein
 */
export function getImageDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '1:1':
      return { width: 1024, height: 1024 };
    case '9:16':
      return { width: 720, height: 1280 };
    default:
      return { width: 1280, height: 720 };
  }
}

/**
 * Calculate frame count from target duration
 * @param targetDuration Duration in seconds
 * @returns Frame count for LTX-2 (25fps)
 */
export function calculateFrameCount(targetDuration: number): number {
  // LTX-2 runs at 25fps
  // Add 1 for the first frame (image-to-video starts with the input image)
  return Math.round(targetDuration * LTX_FPS) + 1;
}

export interface T2IParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  aspectRatio: AspectRatio;
}

/**
 * Hydrate the T2I workflow with dynamic parameters
 */
export function hydrateT2IWorkflow(params: T2IParams): ComfyUIWorkflow {
  // Deep clone the template
  const workflow = JSON.parse(JSON.stringify(t2iWorkflowTemplate)) as ComfyUIWorkflow;

  const { width, height } = getImageDimensions(params.aspectRatio);
  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Set positive prompt
  if (workflow[T2I_NODES.POSITIVE_PROMPT]) {
    workflow[T2I_NODES.POSITIVE_PROMPT].inputs.value = params.prompt;
  }

  // Set negative prompt (optional)
  if (params.negativePrompt && workflow[T2I_NODES.NEGATIVE_PROMPT]) {
    workflow[T2I_NODES.NEGATIVE_PROMPT].inputs.text = params.negativePrompt;
  }

  // Set seed
  if (workflow[T2I_NODES.SEED]) {
    workflow[T2I_NODES.SEED].inputs.noise_seed = seed;
  }

  // Set dimensions
  if (workflow[T2I_NODES.WIDTH]) {
    workflow[T2I_NODES.WIDTH].inputs.value = width;
  }
  if (workflow[T2I_NODES.HEIGHT]) {
    workflow[T2I_NODES.HEIGHT].inputs.value = height;
  }

  return workflow;
}

export interface I2VParams {
  inputImageFilename: string;
  motionPrompt: string;
  negativePrompt?: string;
  seed?: number;
  targetDuration: number; // Duration in seconds
}

/**
 * Hydrate the I2V workflow with dynamic parameters
 */
export function hydrateI2VWorkflow(params: I2VParams): ComfyUIWorkflow {
  // Deep clone the template
  const workflow = JSON.parse(JSON.stringify(i2vWorkflowTemplate)) as ComfyUIWorkflow;

  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const frames = calculateFrameCount(params.targetDuration);

  // Set input image filename
  if (workflow[I2V_NODES.INPUT_IMAGE]) {
    workflow[I2V_NODES.INPUT_IMAGE].inputs.image = params.inputImageFilename;
  }

  // Set motion prompt
  if (workflow[I2V_NODES.POSITIVE_PROMPT]) {
    workflow[I2V_NODES.POSITIVE_PROMPT].inputs.text = params.motionPrompt;
  }

  // Set negative prompt (optional - workflow has good defaults)
  if (params.negativePrompt && workflow[I2V_NODES.NEGATIVE_PROMPT]) {
    workflow[I2V_NODES.NEGATIVE_PROMPT].inputs.text = params.negativePrompt;
  }

  // Set seed
  if (workflow[I2V_NODES.SEED]) {
    workflow[I2V_NODES.SEED].inputs.noise_seed = seed;
  }

  // Set frame count (dynamic based on target duration)
  if (workflow[I2V_NODES.FRAMES]) {
    workflow[I2V_NODES.FRAMES].inputs.value = frames;
  }

  console.log(`[ComfyUI] I2V workflow: ${params.targetDuration}s -> ${frames} frames @ ${LTX_FPS}fps`);

  return workflow;
}

/**
 * Extract the save node ID for T2I workflow (for finding outputs)
 */
export function getT2ISaveNodeId(): string {
  return '9'; // SaveImage node
}

/**
 * Extract the save node ID for I2V workflow (for finding outputs)
 */
export function getI2VSaveNodeId(): string {
  return '75'; // SaveVideo node
}
