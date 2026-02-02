'use client';

import type {
  ComfyUIWorkflow,
  T2IWorkflowMapping,
  I2VWorkflowMapping,
  NodeMapping,
  WorkflowValidationResult
} from './types';

// =============================================================================
// Constants
// =============================================================================

// Match "vc" followed by any dash-like character (hyphen, en-dash, em-dash, minus)
// and optional spaces around it
const VC_PREFIX_REGEX = /^vc\s*[-–—−]\s*/i;

/**
 * Maps title keywords to logical parameters and their expected input keys by node type
 */
const T2I_TITLE_MAP: Record<string, { param: keyof T2IWorkflowMapping; inputKeys: Record<string, string> }> = {
  'pos prompt': {
    param: 'positivePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'PrimitiveStringMultiline': 'value',
      'default': 'text'
    }
  },
  'prompt': {
    param: 'positivePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'PrimitiveStringMultiline': 'value',
      'default': 'text'
    }
  },
  'neg prompt': {
    param: 'negativePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'default': 'text'
    }
  },
  'negative': {
    param: 'negativePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'default': 'text'
    }
  },
  'seed': {
    param: 'seed',
    inputKeys: {
      'RandomNoise': 'noise_seed',
      'KSampler': 'seed',
      'KSamplerAdvanced': 'noise_seed',
      'PrimitiveInt': 'value',
      'default': 'seed'
    }
  },
  'width': {
    param: 'width',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentImage': 'width',
      'EmptySD3LatentImage': 'width',
      'default': 'value'
    }
  },
  'height': {
    param: 'height',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentImage': 'height',
      'EmptySD3LatentImage': 'height',
      'default': 'value'
    }
  },
};

const I2V_TITLE_MAP: Record<string, { param: keyof I2VWorkflowMapping; inputKeys: Record<string, string> }> = {
  'input image': {
    param: 'inputImage',
    inputKeys: {
      'LoadImage': 'image',
      'default': 'image'
    }
  },
  'image': {
    param: 'inputImage',
    inputKeys: {
      'LoadImage': 'image',
      'default': 'image'
    }
  },
  'motion prompt': {
    param: 'motionPrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'default': 'text'
    }
  },
  'prompt': {
    param: 'motionPrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'default': 'text'
    }
  },
  'pos prompt': {
    param: 'motionPrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'PrimitiveString': 'value',
      'PrimitiveStringMultiline': 'value',
      'default': 'text'
    }
  },
  'neg prompt': {
    param: 'negativePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'default': 'text'
    }
  },
  'negative': {
    param: 'negativePrompt',
    inputKeys: {
      'CLIPTextEncode': 'text',
      'default': 'text'
    }
  },
  'seed': {
    param: 'seed',
    inputKeys: {
      'RandomNoise': 'noise_seed',
      'KSampler': 'seed',
      'KSamplerAdvanced': 'noise_seed',
      'default': 'seed'
    }
  },
  'frames': {
    param: 'frames',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentVideo': 'length',
      'WanImageToVideo': 'length',
      'default': 'value'
    }
  },
  'frame count': {
    param: 'frames',
    inputKeys: {
      'PrimitiveInt': 'value',
      'default': 'value'
    }
  },
  'length': {
    param: 'frames',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentVideo': 'length',
      'default': 'value'
    }
  },
  'fps': {
    param: 'fps',
    inputKeys: {
      'PrimitiveInt': 'value',
      'default': 'value'
    }
  },
  'width': {
    param: 'width',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentImage': 'width',
      'WanImageToVideo': 'width',
      'default': 'value'
    }
  },
  'height': {
    param: 'height',
    inputKeys: {
      'PrimitiveInt': 'value',
      'EmptyLatentImage': 'height',
      'WanImageToVideo': 'height',
      'default': 'value'
    }
  },
};

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check if JSON is in API format (object with node IDs as keys)
 * vs standard format (has a `nodes` array)
 */
export function isApiFormat(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false;

  // Standard format has a `nodes` array
  if ('nodes' in json && Array.isArray((json as Record<string, unknown>).nodes)) {
    return false;
  }

  // API format: all top-level keys should be node IDs (strings)
  // and values should be objects with class_type
  const entries = Object.entries(json as Record<string, unknown>);
  if (entries.length === 0) return false;

  return entries.every(([, value]) =>
    typeof value === 'object' &&
    value !== null &&
    'class_type' in value
  );
}

/**
 * Extract node title from node metadata
 */
function getNodeTitle(node: { _meta?: { title?: string } }): string | null {
  return node._meta?.title || null;
}

/**
 * Get the appropriate input key for a node type
 */
function getInputKey(
  classType: string,
  inputKeys: Record<string, string>
): string {
  // Check for exact match
  if (inputKeys[classType]) {
    return inputKeys[classType];
  }

  // Check for partial match (e.g., "CLIPTextEncode" in "CLIPTextEncodeSD3")
  for (const [type, key] of Object.entries(inputKeys)) {
    if (type !== 'default' && classType.includes(type)) {
      return key;
    }
  }

  return inputKeys['default'] || 'value';
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse a T2I workflow and extract node mappings
 */
export function parseT2IWorkflow(workflow: ComfyUIWorkflow): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const foundNodes: string[] = [];

  // Check format
  if (!isApiFormat(workflow)) {
    return {
      isValid: false,
      isApiFormat: false,
      mapping: null,
      errors: ["Invalid format. Please use 'Save (API Format)' in ComfyUI Dev Options."],
      warnings: [],
      foundNodes: [],
    };
  }

  const mapping: T2IWorkflowMapping = {
    positivePrompt: null,
    negativePrompt: null,
    seed: null,
    width: null,
    height: null,
  };

  // Scan all nodes for VC - prefixed titles
  for (const [nodeId, node] of Object.entries(workflow)) {
    const title = getNodeTitle(node as { _meta?: { title?: string } });
    if (!title) continue;

    const match = title.match(VC_PREFIX_REGEX);
    if (!match) continue;

    const keyword = title.slice(match[0].length).trim().toLowerCase();
    foundNodes.push(title);

    const config = T2I_TITLE_MAP[keyword];
    if (!config) {
      warnings.push(`Unknown node title: "${title}". Ignoring.`);
      continue;
    }

    const classType = (node as { class_type: string }).class_type;
    const inputKey = getInputKey(classType, config.inputKeys);

    // Check for duplicate mappings
    if (mapping[config.param] !== null) {
      warnings.push(`Duplicate node for "${config.param}": "${title}". Using first found.`);
      continue;
    }

    mapping[config.param] = {
      nodeId,
      inputKey,
      nodeType: classType,
    };
  }

  // Validate required nodes
  if (!mapping.positivePrompt) {
    errors.push("Missing required node: 'VC - Pos Prompt' or 'VC - Prompt'. Please rename a text/CLIPTextEncode node.");
  }
  if (!mapping.seed) {
    errors.push("Missing required node: 'VC - Seed'. Please rename a RandomNoise/KSampler node.");
  }

  // Width/Height are optional (workflow may have fixed dimensions)
  if (!mapping.width || !mapping.height) {
    warnings.push("Width/Height nodes not found. Using workflow's default dimensions.");
  }

  return {
    isValid: errors.length === 0,
    isApiFormat: true,
    mapping,
    errors,
    warnings,
    foundNodes,
  };
}

/**
 * Parse an I2V workflow and extract node mappings
 */
export function parseI2VWorkflow(workflow: ComfyUIWorkflow): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const foundNodes: string[] = [];

  // Check format
  if (!isApiFormat(workflow)) {
    return {
      isValid: false,
      isApiFormat: false,
      mapping: null,
      errors: ["Invalid format. Please use 'Save (API Format)' in ComfyUI Dev Options."],
      warnings: [],
      foundNodes: [],
    };
  }

  const mapping: I2VWorkflowMapping = {
    inputImage: null,
    motionPrompt: null,
    negativePrompt: null,
    seed: null,
    frames: null,
    fps: null,
    width: null,
    height: null,
  };

  // Scan all nodes for VC - prefixed titles
  for (const [nodeId, node] of Object.entries(workflow)) {
    const title = getNodeTitle(node as { _meta?: { title?: string } });
    if (!title) continue;

    const match = title.match(VC_PREFIX_REGEX);
    if (!match) continue;

    const keyword = title.slice(match[0].length).trim().toLowerCase();
    foundNodes.push(title);

    const config = I2V_TITLE_MAP[keyword];
    if (!config) {
      warnings.push(`Unknown node title: "${title}". Ignoring.`);
      continue;
    }

    const classType = (node as { class_type: string }).class_type;
    const inputKey = getInputKey(classType, config.inputKeys);

    // Check for duplicate mappings
    if (mapping[config.param] !== null) {
      warnings.push(`Duplicate node for "${config.param}": "${title}". Using first found.`);
      continue;
    }

    mapping[config.param] = {
      nodeId,
      inputKey,
      nodeType: classType,
    };
  }

  // Validate required nodes
  if (!mapping.inputImage) {
    errors.push("Missing required node: 'VC - Input Image' or 'VC - Image'. Please rename a LoadImage node.");
  }
  if (!mapping.seed) {
    errors.push("Missing required node: 'VC - Seed'. Please rename a RandomNoise/KSampler node.");
  }

  // Motion prompt is optional but recommended
  if (!mapping.motionPrompt) {
    warnings.push("Motion prompt node not found. Motion description won't be applied.");
  }

  // Frames is optional (workflow may have fixed length)
  if (!mapping.frames) {
    warnings.push("Frames/Length node not found. Using workflow's default video length.");
  }

  // FPS is optional
  if (!mapping.fps) {
    warnings.push("FPS node not found. Please specify FPS manually for accurate beat sync.");
  }

  return {
    isValid: errors.length === 0,
    isApiFormat: true,
    mapping,
    errors,
    warnings,
    foundNodes,
  };
}

/**
 * Parse JSON string and validate as workflow
 */
export function parseWorkflowJson(
  jsonString: string,
  type: 't2i' | 'i2v'
): WorkflowValidationResult {
  try {
    const json = JSON.parse(jsonString);

    if (type === 't2i') {
      return parseT2IWorkflow(json as ComfyUIWorkflow);
    } else {
      return parseI2VWorkflow(json as ComfyUIWorkflow);
    }
  } catch (e) {
    return {
      isValid: false,
      isApiFormat: false,
      mapping: null,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`],
      warnings: [],
      foundNodes: [],
    };
  }
}
