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
