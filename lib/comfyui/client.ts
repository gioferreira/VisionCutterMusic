'use client';

import { v4 as uuidv4 } from 'uuid';
import type {
  ComfyUIConfig,
  ComfyUIPromptResponse,
  ComfyUIMessage,
  ComfyUIWorkflow,
  ConnectionStatus,
  GenerationProgress,
  ComfyUIImageOutput,
  ComfyUIVideoOutput,
} from './types';

export class ComfyUIClient {
  private config: ComfyUIConfig;
  private ws: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private messageHandlers: Map<string, (msg: ComfyUIMessage) => void> = new Map();

  constructor(address: string) {
    // Normalize address: strip protocol, trailing slashes, and whitespace
    const normalizedAddress = address
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    this.config = {
      address: normalizedAddress,
      clientId: uuidv4(),
    };
  }

  get status(): ConnectionStatus {
    return this.connectionStatus;
  }

  get address(): string {
    return this.config.address;
  }

  private get wsUrl(): string {
    return `ws://${this.config.address}/ws?clientId=${this.config.clientId}`;
  }

  /**
   * Build proxy URL for HTTP requests to ComfyUI
   * This avoids CORS issues when ComfyUI is on a different host
   */
  private proxyUrl(endpoint: string, extraParams?: Record<string, string>): string {
    const params = new URLSearchParams({
      address: this.config.address,
      endpoint,
      ...extraParams,
    });
    return `/api/comfyui?${params.toString()}`;
  }

  /**
   * Test connection to ComfyUI server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.proxyUrl('/system_stats'), {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch (error) {
      console.error('[ComfyUI] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Establish WebSocket connection
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.connectionStatus = 'connecting';
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[ComfyUI] WebSocket connected');
        this.connectionStatus = 'connected';
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[ComfyUI] WebSocket error:', error);
        this.connectionStatus = 'error';
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        console.log('[ComfyUI] WebSocket disconnected');
        this.connectionStatus = 'disconnected';
      };

      this.ws.onmessage = (event) => {
        // Skip binary messages (preview images)
        if (event.data instanceof Blob) {
          return;
        }

        try {
          const message = JSON.parse(event.data) as ComfyUIMessage;
          // Dispatch to all registered handlers
          this.messageHandlers.forEach((handler) => {
            handler(message);
          });
        } catch (error) {
          console.warn('[ComfyUI] Failed to parse message:', event.data);
        }
      };
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionStatus = 'disconnected';
    this.messageHandlers.clear();
  }

  /**
   * Upload an image to ComfyUI
   * Note: This makes a direct request to ComfyUI (not through proxy) for file uploads.
   * If CORS is an issue, the user needs to start ComfyUI with --enable-cors-header
   */
  async uploadImage(
    imageData: Blob,
    filename: string,
    subfolder: string = '',
    overwrite: boolean = true
  ): Promise<{ name: string; subfolder: string; type: string }> {
    console.log(`[ComfyUI] Uploading image: ${filename}, size: ${imageData.size}, type: ${imageData.type}`);

    const formData = new FormData();
    formData.append('image', imageData, filename);
    if (subfolder) {
      formData.append('subfolder', subfolder);
    }
    formData.append('overwrite', overwrite.toString());

    // Try direct upload first (works if ComfyUI has CORS enabled)
    try {
      console.log(`[ComfyUI] Trying direct upload to http://${this.config.address}/upload/image`);
      const response = await fetch(`http://${this.config.address}/upload/image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[ComfyUI] Direct upload successful:', result);
        return result;
      } else {
        console.log('[ComfyUI] Direct upload returned:', response.status, response.statusText);
      }
    } catch (error) {
      console.log('[ComfyUI] Direct upload failed:', error);
    }

    // Fall back to proxy (for multipart, we need to serialize differently)
    console.log('[ComfyUI] Falling back to proxy upload...');
    const base64 = await this.blobToBase64(imageData);
    const response = await fetch(this.proxyUrl('/upload/image'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_base64: base64,
        filename,
        subfolder,
        overwrite,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      console.error('[ComfyUI] Proxy upload failed:', error);
      throw new Error(error.error || `Failed to upload image: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[ComfyUI] Proxy upload successful:', result);
    return result;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Queue a prompt for execution
   */
  async queuePrompt(workflow: ComfyUIWorkflow): Promise<ComfyUIPromptResponse> {
    const response = await fetch(this.proxyUrl('/prompt'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.config.clientId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Queue failed' }));
      throw new Error(error.error || `Failed to queue prompt: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Wait for prompt completion and return outputs
   */
  async waitForCompletion(
    promptId: string,
    onProgress?: (progress: GenerationProgress) => void,
    timeoutMs: number = 600000 // 10 minute timeout for video generation
  ): Promise<{ images: ComfyUIImageOutput[]; videos: ComfyUIVideoOutput[] }> {
    return new Promise((resolve, reject) => {
      const images: ComfyUIImageOutput[] = [];
      const videos: ComfyUIVideoOutput[] = [];
      let maxProgress = 0;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const handlerId = `prompt-${promptId}`;
      console.log(`[ComfyUI] Waiting for prompt ${promptId}...`);

      let stateCheckInterval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        this.messageHandlers.delete(handlerId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (stateCheckInterval) {
          clearInterval(stateCheckInterval);
          stateCheckInterval = null;
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        console.log(`[ComfyUI] Timeout reached for ${promptId}. WebSocket state:`, this.ws?.readyState, 'Collected:', { images: images.length, videos: videos.length });
        cleanup();
        reject(new Error(`Timeout waiting for prompt ${promptId} to complete`));
      }, timeoutMs);

      // Log WebSocket state periodically
      stateCheckInterval = setInterval(() => {
        if (this.ws) {
          console.log(`[ComfyUI] WebSocket state check: readyState=${this.ws.readyState}, connectionStatus=${this.connectionStatus}, collected images=${images.length}, videos=${videos.length}`);
        } else {
          console.log(`[ComfyUI] WebSocket is null!`);
        }
      }, 30000); // Check every 30 seconds

      const handler = (message: ComfyUIMessage) => {
        // Log all messages for debugging (except high-frequency ones)
        if (message.type !== 'progress') {
          if (message.type === 'status') {
            // Log status changes that indicate queue state
            const statusData = message.data as { status?: { exec_info?: { queue_remaining?: number } } };
            if (statusData?.status?.exec_info?.queue_remaining !== undefined) {
              console.log(`[ComfyUI] Queue remaining:`, statusData.status.exec_info.queue_remaining);
            }
          } else {
            console.log(`[ComfyUI] Message for ${promptId}:`, message.type, JSON.stringify(message));
          }
        }

        // Only filter by prompt_id for messages that have it
        // Don't skip status messages which may not have prompt_id
        if ('data' in message && message.data && 'prompt_id' in message.data) {
          if (message.data.prompt_id !== promptId) {
            // Log that we're skipping a message for a different prompt
            if (message.type !== 'progress' && message.type !== 'status') {
              console.log(`[ComfyUI] Skipping ${message.type} for different prompt: ${message.data.prompt_id}`);
            }
            return;
          }
        }

        switch (message.type) {
          case 'status':
            // Status messages are already logged above, nothing else to do
            break;

          case 'execution_start':
            console.log(`[ComfyUI] Execution started for ${promptId}`);
            onProgress?.({
              stage: 'processing',
              progress: 0,
            });
            break;

          case 'progress':
            if (message.data.prompt_id === promptId) {
              const progress = Math.round((message.data.value / message.data.max) * 100);
              if (progress > maxProgress) {
                maxProgress = progress;
                onProgress?.({
                  stage: 'processing',
                  progress,
                  currentNode: message.data.node,
                });
              }
            }
            break;

          case 'executing':
            console.log(`[ComfyUI] Executing node:`, message.data.node, 'for prompt:', message.data.prompt_id, '(waiting for:', promptId, ')');
            if (message.data.node === null) {
              console.log(`[ComfyUI] Got null node (completion signal) for prompt ${message.data.prompt_id}`);
              if (message.data.prompt_id === promptId) {
                // Execution finished - but check if we captured any outputs
                console.log(`[ComfyUI] Execution completed for ${promptId}`, { imageCount: images.length, videoCount: videos.length, images, videos });

                // Always try fetching from history as fallback for videos
                // SaveVideo nodes often don't emit proper 'executed' messages
                console.log('[ComfyUI] Fetching from history to ensure we have all outputs...');
                this.fetchHistoryOutputs(promptId).then((historyOutputs) => {
                  // Merge history outputs with WebSocket-captured outputs
                  const allImages = [...images];
                  const allVideos = [...videos];

                  // Add any outputs from history that we didn't already capture
                  for (const img of historyOutputs.images) {
                    if (!allImages.some(i => i.filename === img.filename)) {
                      console.log('[ComfyUI] Found additional image from history:', img.filename);
                      allImages.push(img);
                    }
                  }
                  for (const vid of historyOutputs.videos) {
                    if (!allVideos.some(v => v.filename === vid.filename)) {
                      console.log('[ComfyUI] Found additional video from history:', vid.filename);
                      allVideos.push(vid);
                    }
                  }

                  console.log(`[ComfyUI] Final outputs: ${allImages.length} images, ${allVideos.length} videos`);
                  cleanup();
                  onProgress?.({
                    stage: 'completed',
                    progress: 100,
                  });
                  resolve({ images: allImages, videos: allVideos });
                }).catch((err) => {
                  console.error('[ComfyUI] History fallback failed:', err);
                  cleanup();
                  onProgress?.({
                    stage: 'completed',
                    progress: 100,
                  });
                  // Still return what we captured from WebSocket
                  resolve({ images, videos });
                });
              } else {
                console.log(`[ComfyUI] Ignoring completion for different prompt: ${message.data.prompt_id} !== ${promptId}`);
              }
            }
            break;

          case 'executed':
            if (message.data.prompt_id === promptId) {
              // Collect outputs - check multiple possible output formats
              console.log(`[ComfyUI] Node ${message.data.node} executed for ${promptId}:`, JSON.stringify(message.data.output));

              const output = message.data.output as Record<string, unknown>;

              // Check direct output keys
              if (message.data.output.images) {
                images.push(...message.data.output.images);
              }
              if (message.data.output.videos) {
                videos.push(...message.data.output.videos);
              }

              // Some video nodes output as 'video' (singular) or 'gifs'
              if (output.video && Array.isArray(output.video)) {
                videos.push(...(output.video as ComfyUIVideoOutput[]));
              }
              if (output.gifs && Array.isArray(output.gifs)) {
                videos.push(...(output.gifs as ComfyUIVideoOutput[]));
              }

              // SaveVideo node often outputs under 'ui' key
              const ui = output.ui as Record<string, unknown> | undefined;
              if (ui) {
                if (Array.isArray(ui.videos)) {
                  console.log('[ComfyUI] Found videos under ui.videos');
                  videos.push(...(ui.videos as ComfyUIVideoOutput[]));
                }
                if (Array.isArray(ui.images)) {
                  console.log('[ComfyUI] Found images under ui.images');
                  images.push(...(ui.images as ComfyUIImageOutput[]));
                }
                if (Array.isArray(ui.gifs)) {
                  console.log('[ComfyUI] Found videos under ui.gifs');
                  videos.push(...(ui.gifs as ComfyUIVideoOutput[]));
                }
              }

              // Some nodes output results directly with filename/subfolder/type structure
              if (output.filename && typeof output.filename === 'string') {
                const result = {
                  filename: output.filename as string,
                  subfolder: (output.subfolder as string) || '',
                  type: (output.type as string) || 'output',
                };
                // Determine if it's a video or image based on filename extension
                const ext = result.filename.split('.').pop()?.toLowerCase();
                if (['mp4', 'webm', 'mov', 'avi', 'gif'].includes(ext || '')) {
                  console.log('[ComfyUI] Found video in direct output:', result);
                  videos.push(result);
                } else {
                  console.log('[ComfyUI] Found image in direct output:', result);
                  images.push(result);
                }
              }
            }
            break;

          case 'execution_cached':
            if (message.data.prompt_id === promptId) {
              console.log(`[ComfyUI] Cached nodes for ${promptId}:`, message.data.nodes);
            }
            break;

          case 'execution_error':
            if (message.data.prompt_id === promptId) {
              cleanup();
              const errorMsg = message.data.exception_message || 'Unknown execution error';
              console.error(`[ComfyUI] Execution error for ${promptId}:`, errorMsg);
              onProgress?.({
                stage: 'error',
                progress: 0,
                error: errorMsg,
              });
              reject(new Error(errorMsg));
            }
            break;
        }
      };

      this.messageHandlers.set(handlerId, handler);

      onProgress?.({
        stage: 'queued',
        progress: 0,
      });
    });
  }

  /**
   * Fetch outputs from history API as fallback
   * Some nodes don't emit 'executed' messages properly
   */
  private async fetchHistoryOutputs(promptId: string): Promise<{ images: ComfyUIImageOutput[]; videos: ComfyUIVideoOutput[] }> {
    const images: ComfyUIImageOutput[] = [];
    const videos: ComfyUIVideoOutput[] = [];

    try {
      const response = await fetch(this.proxyUrl(`/history/${promptId}`));
      if (!response.ok) {
        console.log('[ComfyUI] History fetch failed:', response.status);
        return { images, videos };
      }

      const history = await response.json();
      console.log('[ComfyUI] History response:', JSON.stringify(history));

      const promptHistory = history[promptId];
      if (!promptHistory?.outputs) {
        console.log('[ComfyUI] No outputs in history');
        return { images, videos };
      }

      // Video file extensions
      const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'gif', 'mkv'];

      // Iterate through all node outputs
      for (const [nodeId, output] of Object.entries(promptHistory.outputs)) {
        const nodeOutput = output as Record<string, unknown>;
        console.log(`[ComfyUI] History output for node ${nodeId}:`, JSON.stringify(nodeOutput));

        // Check for images - but SaveVideo nodes put videos under 'images' key!
        // So we need to check file extension to determine if it's actually a video
        if (Array.isArray(nodeOutput.images)) {
          for (const item of nodeOutput.images) {
            if (item && typeof item === 'object' && 'filename' in item) {
              const filename = (item as { filename: string }).filename;
              const ext = filename.split('.').pop()?.toLowerCase() || '';
              if (videoExtensions.includes(ext)) {
                console.log(`[ComfyUI] Found video in images array: ${filename}`);
                videos.push(item as ComfyUIVideoOutput);
              } else {
                images.push(item as ComfyUIImageOutput);
              }
            }
          }
        }

        // Check for videos in various formats
        if (Array.isArray(nodeOutput.videos)) {
          for (const vid of nodeOutput.videos) {
            if (vid && typeof vid === 'object' && 'filename' in vid) {
              videos.push(vid as ComfyUIVideoOutput);
            }
          }
        }
        if (Array.isArray(nodeOutput.video)) {
          for (const vid of nodeOutput.video) {
            if (vid && typeof vid === 'object' && 'filename' in vid) {
              videos.push(vid as ComfyUIVideoOutput);
            }
          }
        }
        if (Array.isArray(nodeOutput.gifs)) {
          for (const vid of nodeOutput.gifs) {
            if (vid && typeof vid === 'object' && 'filename' in vid) {
              videos.push(vid as ComfyUIVideoOutput);
            }
          }
        }
      }

      console.log(`[ComfyUI] History fallback found ${images.length} images, ${videos.length} videos`);
    } catch (error) {
      console.error('[ComfyUI] History fetch error:', error);
    }

    return { images, videos };
  }

  /**
   * Get the URL to view/download an output file
   * Uses proxy to avoid CORS issues
   */
  getOutputUrl(filename: string, subfolder: string = '', type: string = 'output'): string {
    // Only include non-empty parameters
    const params: Record<string, string> = { filename, type };
    if (subfolder) {
      params.subfolder = subfolder;
    }
    return this.proxyUrl('/view', params);
  }

  /**
   * Fetch an output file and return as data URL
   * More reliable than returning a URL that needs to be fetched later
   */
  async fetchOutputAsDataUrl(filename: string, subfolder: string = '', type: string = 'output'): Promise<string> {
    // Build URL manually to avoid encoding issues
    const params = new URLSearchParams();
    params.set('address', this.config.address);
    params.set('endpoint', '/view');
    params.set('filename', filename);
    params.set('type', type);
    if (subfolder) {
      params.set('subfolder', subfolder);
    }

    const url = `/api/comfyui?${params.toString()}`;
    console.log('[ComfyUI] Fetching output from:', url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch output: ${response.status} - ${error}`);
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('[ComfyUI] Fetch output error:', error);
      throw error;
    }
  }

  /**
   * Fetch an image from a URL and return as Blob (for uploading to ComfyUI)
   * Handles data URLs, external URLs (via proxy), and local URLs
   */
  async fetchImageAsBlob(imageUrl: string): Promise<Blob> {
    // Handle data URLs directly
    if (imageUrl.startsWith('data:')) {
      console.log('[ComfyUI] Converting data URL to blob...');
      const response = await fetch(imageUrl);
      let blob = await response.blob();
      console.log('[ComfyUI] Data URL converted to blob:', blob.size, 'bytes', blob.type);

      // Ensure correct MIME type for PNG images
      if (!blob.type || blob.type === 'application/octet-stream') {
        blob = new Blob([blob], { type: 'image/png' });
        console.log('[ComfyUI] Corrected blob type to image/png');
      }
      return blob;
    }

    // Use proxy for external URLs
    const isExternal = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
    const fetchUrl = isExternal
      ? `/api/proxy?url=${encodeURIComponent(imageUrl)}`
      : imageUrl;

    console.log('[ComfyUI] Fetching image from:', fetchUrl);
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('[ComfyUI] Fetched blob:', blob.size, 'bytes', blob.type);
    return blob;
  }

  /**
   * Update the server address
   */
  updateAddress(address: string): void {
    const wasConnected = this.connectionStatus === 'connected';
    this.disconnect();
    this.config.address = address.replace(/^https?:\/\//, '');
    if (wasConnected) {
      this.connect().catch(console.error);
    }
  }
}

// Singleton instance
let clientInstance: ComfyUIClient | null = null;

export function getComfyUIClient(address?: string): ComfyUIClient {
  if (!clientInstance && address) {
    clientInstance = new ComfyUIClient(address);
  }
  if (!clientInstance) {
    throw new Error('ComfyUI client not initialized. Call with address first.');
  }
  return clientInstance;
}

export function resetComfyUIClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}

export function initComfyUIClient(address: string): ComfyUIClient {
  resetComfyUIClient();
  clientInstance = new ComfyUIClient(address);
  return clientInstance;
}
