// ComfyUI client configuration
export interface ComfyUIConfig {
  address: string; // e.g., "127.0.0.1:8188"
  clientId: string;
}

// Response from POST /prompt
export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

// WebSocket message types
export type ComfyUIMessageType =
  | 'status'
  | 'progress'
  | 'executing'
  | 'executed'
  | 'execution_start'
  | 'execution_cached'
  | 'execution_error';

export interface ComfyUIStatusMessage {
  type: 'status';
  data: {
    status: {
      exec_info: {
        queue_remaining: number;
      };
    };
    sid?: string;
  };
}

export interface ComfyUIProgressMessage {
  type: 'progress';
  data: {
    value: number;
    max: number;
    prompt_id: string;
    node: string;
  };
}

export interface ComfyUIExecutingMessage {
  type: 'executing';
  data: {
    node: string | null;
    prompt_id: string;
  };
}

export interface ComfyUIExecutedMessage {
  type: 'executed';
  data: {
    node: string;
    output: {
      images?: Array<{
        filename: string;
        subfolder: string;
        type: string;
      }>;
      videos?: Array<{
        filename: string;
        subfolder: string;
        type: string;
      }>;
    };
    prompt_id: string;
  };
}

export interface ComfyUIExecutionStartMessage {
  type: 'execution_start';
  data: {
    prompt_id: string;
  };
}

export interface ComfyUIExecutionCachedMessage {
  type: 'execution_cached';
  data: {
    nodes: string[];
    prompt_id: string;
  };
}

export interface ComfyUIExecutionErrorMessage {
  type: 'execution_error';
  data: {
    prompt_id: string;
    node_id: string;
    node_type: string;
    exception_message: string;
    exception_type: string;
    traceback: string[];
  };
}

export type ComfyUIMessage =
  | ComfyUIStatusMessage
  | ComfyUIProgressMessage
  | ComfyUIExecutingMessage
  | ComfyUIExecutedMessage
  | ComfyUIExecutionStartMessage
  | ComfyUIExecutionCachedMessage
  | ComfyUIExecutionErrorMessage;

// Workflow JSON structure (simplified - ComfyUI workflows are flexible)
export type ComfyUIWorkflow = Record<string, ComfyUINode>;

export interface ComfyUINode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: {
    title?: string;
  };
}

// Connection status for UI
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Progress callback type
export interface GenerationProgress {
  stage: 'queued' | 'processing' | 'completed' | 'error';
  progress: number; // 0-100
  currentNode?: string;
  error?: string;
}

// Output types
export interface ComfyUIImageOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyUIVideoOutput {
  filename: string;
  subfolder: string;
  type: string;
}

// =============================================================================
// Custom Workflow (BYOW) Types
// =============================================================================

/**
 * Valid node title keywords for custom workflows (case-insensitive, after "VC - " prefix)
 */
export type T2INodeTitle =
  | 'pos prompt'
  | 'prompt'
  | 'neg prompt'
  | 'negative'
  | 'seed'
  | 'width'
  | 'height';

export type I2VNodeTitle =
  | 'input image'
  | 'image'
  | 'motion prompt'
  | 'prompt'
  | 'neg prompt'
  | 'negative'
  | 'seed'
  | 'frames'
  | 'frame count'
  | 'length'
  | 'fps';

/**
 * Mapping from logical parameter to node ID and input key
 */
export interface NodeMapping {
  nodeId: string;
  inputKey: string;
  nodeType: string; // class_type for debugging
}

/**
 * Parsed node mappings for T2I workflow
 */
export interface T2IWorkflowMapping {
  positivePrompt: NodeMapping | null;
  negativePrompt: NodeMapping | null;
  seed: NodeMapping | null;
  width: NodeMapping | null;
  height: NodeMapping | null;
}

/**
 * Parsed node mappings for I2V workflow
 */
export interface I2VWorkflowMapping {
  inputImage: NodeMapping | null;
  motionPrompt: NodeMapping | null;
  negativePrompt: NodeMapping | null;
  seed: NodeMapping | null;
  frames: NodeMapping | null;
  fps: NodeMapping | null; // Optional - user can override
  width: NodeMapping | null; // Optional - some workflows have dimension controls
  height: NodeMapping | null; // Optional - some workflows have dimension controls
}

/**
 * Result of workflow parsing/validation
 */
export interface WorkflowValidationResult {
  isValid: boolean;
  isApiFormat: boolean;
  mapping: T2IWorkflowMapping | I2VWorkflowMapping | null;
  errors: string[];
  warnings: string[];
  foundNodes: string[]; // List of found VC - prefixed nodes
}

/**
 * Custom workflow configuration stored in app state
 */
export interface CustomWorkflowConfig {
  t2iMapping: T2IWorkflowMapping | null;
  i2vMapping: I2VWorkflowMapping | null;
  i2vFps: number; // User-specified or detected from workflow
}
