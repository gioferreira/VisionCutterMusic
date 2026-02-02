'use client';

import type { ComfyUIWorkflow, T2IWorkflowMapping, I2VWorkflowMapping } from './types';
import type { AspectRatio, T2IModel, I2VModel } from '@/stores/app-store';

// Import all workflow templates
import t2iKleinWorkflow from '@/workflows/t2i_workflow_Klein_api.json';
import t2iZimageWorkflow from '@/workflows/t2i_zimage_workflow_api.json';
import i2vLtx2Workflow from '@/workflows/i2v_workflow_LTX-2_api.json';
import i2vWan22Workflow from '@/workflows/i2v-wan2.2default_workflow_api.json';

// =============================================================================
// T2I Node ID Mappings
// =============================================================================

const T2I_KLEIN_NODES = {
  POSITIVE_PROMPT: '76',      // PrimitiveStringMultiline - inputs.value
  NEGATIVE_PROMPT: '75:67',   // CLIPTextEncode - inputs.text
  SEED: '75:73',              // RandomNoise - inputs.noise_seed
  WIDTH: '75:68',             // PrimitiveInt - inputs.value
  HEIGHT: '75:69',            // PrimitiveInt - inputs.value
};

const T2I_ZIMAGE_NODES = {
  POSITIVE_PROMPT: '67',      // CLIPTextEncode - inputs.text
  NEGATIVE_PROMPT: '71',      // CLIPTextEncode - inputs.text
  SEED: '69',                 // KSampler - inputs.seed
  IMAGE_SIZE: '68',           // EmptySD3LatentImage - inputs.width, inputs.height
};

// =============================================================================
// I2V Node ID Mappings
// =============================================================================

const I2V_LTX2_NODES = {
  INPUT_IMAGE: '98',          // LoadImage - inputs.image
  POSITIVE_PROMPT: '92:3',    // CLIPTextEncode - inputs.text
  NEGATIVE_PROMPT: '92:4',    // CLIPTextEncode - inputs.text
  SEED: '92:11',              // RandomNoise - inputs.noise_seed
  FRAMES: '92:62',            // PrimitiveInt - inputs.value
};

const I2V_WAN22_NODES = {
  INPUT_IMAGE: '97',          // LoadImage - inputs.image
  POSITIVE_PROMPT: '93',      // CLIPTextEncode - inputs.text
  NEGATIVE_PROMPT: '89',      // CLIPTextEncode - inputs.text
  SEED: '86',                 // KSamplerAdvanced - inputs.noise_seed
  VIDEO_CONFIG: '98',         // WanImageToVideo - inputs.width, inputs.height, inputs.length
};

// =============================================================================
// Model-specific Settings
// =============================================================================

const I2V_FPS: Record<I2VModel, number> = {
  'ltx-2': 25,
  'wan-2.2': 16,
};

const T2I_SAVE_NODE: Record<T2IModel, string> = {
  'flux-klein': '9',
  'z-image': '9',
};

const I2V_SAVE_NODE: Record<I2VModel, string> = {
  'ltx-2': '75',
  'wan-2.2': '108',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get pixel dimensions for aspect ratio
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
 */
export function calculateFrameCount(targetDuration: number, model: I2VModel): number {
  const fps = I2V_FPS[model];
  return Math.round(targetDuration * fps) + 1;
}

/**
 * Get FPS for a model
 */
export function getModelFps(model: I2VModel): number {
  return I2V_FPS[model];
}

/**
 * Get the SaveImage node ID for T2I workflow
 */
export function getT2ISaveNodeId(model: T2IModel): string {
  return T2I_SAVE_NODE[model];
}

/**
 * Get the SaveVideo node ID for I2V workflow
 */
export function getI2VSaveNodeId(model: I2VModel): string {
  return I2V_SAVE_NODE[model];
}

// =============================================================================
// T2I Workflow Hydration
// =============================================================================

export interface T2IParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  aspectRatio: AspectRatio;
  model: T2IModel;
}

/**
 * Hydrate the T2I workflow with dynamic parameters
 */
export function hydrateT2IWorkflow(params: T2IParams): ComfyUIWorkflow {
  const { width, height } = getImageDimensions(params.aspectRatio);
  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  if (params.model === 'flux-klein') {
    return hydrateT2IKlein(params.prompt, params.negativePrompt, seed, width, height);
  } else {
    return hydrateT2IZimage(params.prompt, params.negativePrompt, seed, width, height);
  }
}

function hydrateT2IKlein(
  prompt: string,
  negativePrompt: string | undefined,
  seed: number,
  width: number,
  height: number
): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(t2iKleinWorkflow)) as ComfyUIWorkflow;
  const nodes = T2I_KLEIN_NODES;

  // Set positive prompt (PrimitiveStringMultiline uses 'value')
  if (workflow[nodes.POSITIVE_PROMPT]) {
    workflow[nodes.POSITIVE_PROMPT].inputs.value = prompt;
  }

  // Set negative prompt (CLIPTextEncode uses 'text')
  if (negativePrompt && workflow[nodes.NEGATIVE_PROMPT]) {
    workflow[nodes.NEGATIVE_PROMPT].inputs.text = negativePrompt;
  }

  // Set seed (RandomNoise uses 'noise_seed')
  if (workflow[nodes.SEED]) {
    workflow[nodes.SEED].inputs.noise_seed = seed;
  }

  // Set dimensions (PrimitiveInt uses 'value')
  if (workflow[nodes.WIDTH]) {
    workflow[nodes.WIDTH].inputs.value = width;
  }
  if (workflow[nodes.HEIGHT]) {
    workflow[nodes.HEIGHT].inputs.value = height;
  }

  return workflow;
}

function hydrateT2IZimage(
  prompt: string,
  negativePrompt: string | undefined,
  seed: number,
  width: number,
  height: number
): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(t2iZimageWorkflow)) as ComfyUIWorkflow;
  const nodes = T2I_ZIMAGE_NODES;

  // Set positive prompt (CLIPTextEncode uses 'text')
  if (workflow[nodes.POSITIVE_PROMPT]) {
    workflow[nodes.POSITIVE_PROMPT].inputs.text = prompt;
  }

  // Set negative prompt
  if (negativePrompt && workflow[nodes.NEGATIVE_PROMPT]) {
    workflow[nodes.NEGATIVE_PROMPT].inputs.text = negativePrompt;
  }

  // Set seed (KSampler uses 'seed')
  if (workflow[nodes.SEED]) {
    workflow[nodes.SEED].inputs.seed = seed;
  }

  // Set dimensions (EmptySD3LatentImage uses direct width/height)
  if (workflow[nodes.IMAGE_SIZE]) {
    workflow[nodes.IMAGE_SIZE].inputs.width = width;
    workflow[nodes.IMAGE_SIZE].inputs.height = height;
  }

  return workflow;
}

// =============================================================================
// I2V Workflow Hydration
// =============================================================================

export interface I2VParams {
  inputImageFilename: string;
  motionPrompt: string;
  negativePrompt?: string;
  seed?: number;
  targetDuration: number;
  model: I2VModel;
  aspectRatio?: AspectRatio; // For Wan2.2 which needs dimensions
}

/**
 * Hydrate the I2V workflow with dynamic parameters
 */
export function hydrateI2VWorkflow(params: I2VParams): ComfyUIWorkflow {
  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const frames = calculateFrameCount(params.targetDuration, params.model);

  console.log(`[ComfyUI] I2V workflow (${params.model}): ${params.targetDuration}s -> ${frames} frames @ ${I2V_FPS[params.model]}fps`);

  if (params.model === 'ltx-2') {
    return hydrateI2VLtx2(params.inputImageFilename, params.motionPrompt, params.negativePrompt, seed, frames);
  } else {
    return hydrateI2VWan22(params.inputImageFilename, params.motionPrompt, params.negativePrompt, seed, frames, params.aspectRatio);
  }
}

function hydrateI2VLtx2(
  inputImageFilename: string,
  motionPrompt: string,
  negativePrompt: string | undefined,
  seed: number,
  frames: number
): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(i2vLtx2Workflow)) as ComfyUIWorkflow;
  const nodes = I2V_LTX2_NODES;

  // Set input image filename
  if (workflow[nodes.INPUT_IMAGE]) {
    workflow[nodes.INPUT_IMAGE].inputs.image = inputImageFilename;
  }

  // Set motion prompt
  if (workflow[nodes.POSITIVE_PROMPT]) {
    workflow[nodes.POSITIVE_PROMPT].inputs.text = motionPrompt;
  }

  // Set negative prompt
  if (negativePrompt && workflow[nodes.NEGATIVE_PROMPT]) {
    workflow[nodes.NEGATIVE_PROMPT].inputs.text = negativePrompt;
  }

  // Set seed (RandomNoise uses 'noise_seed')
  if (workflow[nodes.SEED]) {
    workflow[nodes.SEED].inputs.noise_seed = seed;
  }

  // Set frame count (PrimitiveInt uses 'value')
  if (workflow[nodes.FRAMES]) {
    workflow[nodes.FRAMES].inputs.value = frames;
  }

  return workflow;
}

function hydrateI2VWan22(
  inputImageFilename: string,
  motionPrompt: string,
  negativePrompt: string | undefined,
  seed: number,
  frames: number,
  aspectRatio?: AspectRatio
): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(i2vWan22Workflow)) as ComfyUIWorkflow;
  const nodes = I2V_WAN22_NODES;

  // Set input image filename
  if (workflow[nodes.INPUT_IMAGE]) {
    workflow[nodes.INPUT_IMAGE].inputs.image = inputImageFilename;
  }

  // Set motion prompt
  if (workflow[nodes.POSITIVE_PROMPT]) {
    workflow[nodes.POSITIVE_PROMPT].inputs.text = motionPrompt;
  }

  // Set negative prompt (Wan2.2 has Chinese default, may want to override)
  if (negativePrompt && workflow[nodes.NEGATIVE_PROMPT]) {
    workflow[nodes.NEGATIVE_PROMPT].inputs.text = negativePrompt;
  }

  // Set seed (KSamplerAdvanced uses 'noise_seed')
  if (workflow[nodes.SEED]) {
    workflow[nodes.SEED].inputs.noise_seed = seed;
  }

  // Set video dimensions and length (WanImageToVideo node)
  if (workflow[nodes.VIDEO_CONFIG]) {
    workflow[nodes.VIDEO_CONFIG].inputs.length = frames;

    // Optionally set dimensions if aspectRatio provided
    if (aspectRatio) {
      const { width, height } = getImageDimensions(aspectRatio);
      workflow[nodes.VIDEO_CONFIG].inputs.width = width;
      workflow[nodes.VIDEO_CONFIG].inputs.height = height;
    }
  }

  return workflow;
}

// =============================================================================
// Custom Workflow Hydration (BYOW)
// =============================================================================

export interface CustomT2IParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width: number;
  height: number;
  workflow: ComfyUIWorkflow;
  mapping: T2IWorkflowMapping;
}

export interface CustomI2VParams {
  inputImageFilename: string;
  motionPrompt: string;
  negativePrompt?: string;
  seed?: number;
  frames: number;
  width?: number;
  height?: number;
  workflow: ComfyUIWorkflow;
  mapping: I2VWorkflowMapping;
}

/**
 * Hydrate a custom T2I workflow with dynamic parameters
 */
export function hydrateCustomT2IWorkflow(params: CustomT2IParams): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(params.workflow)) as ComfyUIWorkflow;
  const mapping = params.mapping;
  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Set positive prompt
  if (mapping.positivePrompt) {
    const node = workflow[mapping.positivePrompt.nodeId];
    if (node) {
      node.inputs[mapping.positivePrompt.inputKey] = params.prompt;
    }
  }

  // Set negative prompt
  if (mapping.negativePrompt && params.negativePrompt) {
    const node = workflow[mapping.negativePrompt.nodeId];
    if (node) {
      node.inputs[mapping.negativePrompt.inputKey] = params.negativePrompt;
    }
  }

  // Set seed
  if (mapping.seed) {
    const node = workflow[mapping.seed.nodeId];
    if (node) {
      node.inputs[mapping.seed.inputKey] = seed;
    }
  }

  // Set width
  if (mapping.width) {
    const node = workflow[mapping.width.nodeId];
    if (node) {
      node.inputs[mapping.width.inputKey] = params.width;
    }
  }

  // Set height
  if (mapping.height) {
    const node = workflow[mapping.height.nodeId];
    if (node) {
      node.inputs[mapping.height.inputKey] = params.height;
    }
  }

  return workflow;
}

/**
 * Hydrate a custom I2V workflow with dynamic parameters
 */
export function hydrateCustomI2VWorkflow(params: CustomI2VParams): ComfyUIWorkflow {
  const workflow = JSON.parse(JSON.stringify(params.workflow)) as ComfyUIWorkflow;
  const mapping = params.mapping;
  const seed = params.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  // Set input image
  if (mapping.inputImage) {
    const node = workflow[mapping.inputImage.nodeId];
    if (node) {
      node.inputs[mapping.inputImage.inputKey] = params.inputImageFilename;
    }
  }

  // Set motion prompt
  if (mapping.motionPrompt) {
    const node = workflow[mapping.motionPrompt.nodeId];
    if (node) {
      node.inputs[mapping.motionPrompt.inputKey] = params.motionPrompt;
    }
  }

  // Set negative prompt
  if (mapping.negativePrompt && params.negativePrompt) {
    const node = workflow[mapping.negativePrompt.nodeId];
    if (node) {
      node.inputs[mapping.negativePrompt.inputKey] = params.negativePrompt;
    }
  }

  // Set seed
  if (mapping.seed) {
    const node = workflow[mapping.seed.nodeId];
    if (node) {
      node.inputs[mapping.seed.inputKey] = seed;
    }
  }

  // Set frame count
  if (mapping.frames) {
    const node = workflow[mapping.frames.nodeId];
    if (node) {
      node.inputs[mapping.frames.inputKey] = params.frames;
    }
  }

  // Set width
  if (mapping.width && params.width) {
    const node = workflow[mapping.width.nodeId];
    if (node) {
      node.inputs[mapping.width.inputKey] = params.width;
    }
  }

  // Set height
  if (mapping.height && params.height) {
    const node = workflow[mapping.height.nodeId];
    if (node) {
      node.inputs[mapping.height.inputKey] = params.height;
    }
  }

  return workflow;
}
