import { create } from 'zustand';
import type { T2IWorkflowMapping, I2VWorkflowMapping, FrameStrategy } from '@/lib/comfyui/types';

export type Step = 'audio' | 'style' | 'story' | 'generate' | 'export';
export type AspectRatio = '16:9' | '1:1' | '9:16';
export type BeatsPerScene = number; // 1, 2, 3, 4, 5, etc.
export type SyncMode = 'bpm' | 'beat';
export type BackendType = 'fal' | 'local';
export type LocalConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type T2IModel = 'flux-klein' | 'z-image';
export type I2VModel = 'ltx-2' | 'wan-2.2';
export type WorkflowMode = 'presets' | 'custom';

export interface Scene {
  id: string;
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
  status: 'pending' | 'generating-image' | 'image-ready' | 'generating-video' | 'video-ready' | 'error';
  error?: string;
  generatedDuration?: number; // Actual duration of generated video in seconds
}

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  suffix: string;
  preview: string;
  colors: string[];
}

export interface AppState {
  // Navigation
  currentStep: Step;
  setCurrentStep: (step: Step) => void;
  canProceed: () => boolean;

  // Audio
  audioFile: File | null;
  audioUrl: string | null;
  bpm: number | null;
  beatOffset: number; // Time in seconds when first beat occurs
  audioDuration: number | null;
  beats: number[] | null;
  syncMode: SyncMode;
  setAudioFile: (file: File | null) => void;
  setAudioUrl: (url: string | null) => void;
  setBpm: (bpm: number | null) => void;
  setBeatOffset: (offset: number) => void;
  setAudioDuration: (duration: number | null) => void;
  setBeats: (beats: number[] | null) => void;
  setSyncMode: (mode: SyncMode) => void;

  // Video Settings
  aspectRatio: AspectRatio;
  beatsPerScene: BeatsPerScene;
  setAspectRatio: (ratio: AspectRatio) => void;
  setBeatsPerScene: (beats: BeatsPerScene) => void;

  // Style
  selectedStyle: StylePreset | null;
  setSelectedStyle: (style: StylePreset | null) => void;

  // Story/Scenes
  scenes: Scene[];
  addScene: (prompt: string) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  reorderScenes: (startIndex: number, endIndex: number) => void;
  setScenes: (scenes: Scene[]) => void;

  // Generation
  isGenerating: boolean;
  generationProgress: number;
  setIsGenerating: (isGenerating: boolean) => void;
  setGenerationProgress: (progress: number) => void;

  // API Key
  falApiKey: string | null;
  setFalApiKey: (key: string | null) => void;

  // Backend Selection
  backendType: BackendType;
  localApiAddress: string;
  localConnectionStatus: LocalConnectionStatus;
  setBackendType: (type: BackendType) => void;
  setLocalApiAddress: (address: string) => void;
  setLocalConnectionStatus: (status: LocalConnectionStatus) => void;

  // Model Selection (ComfyUI)
  t2iModel: T2IModel;
  i2vModel: I2VModel;
  setT2IModel: (model: T2IModel) => void;
  setI2VModel: (model: I2VModel) => void;

  // Custom Workflow (BYOW)
  workflowMode: WorkflowMode;
  customT2IMapping: T2IWorkflowMapping | null;
  customI2VMapping: I2VWorkflowMapping | null;
  customI2VFps: number;
  setWorkflowMode: (mode: WorkflowMode) => void;
  setCustomT2IMapping: (mapping: T2IWorkflowMapping | null) => void;
  setCustomI2VMapping: (mapping: I2VWorkflowMapping | null) => void;
  setCustomI2VFps: (fps: number) => void;

  // Frame Strategy (ComfyUI only)
  frameStrategy: FrameStrategy;
  framePadding: number; // Extra frames when strategy is 'padding'
  setFrameStrategy: (strategy: FrameStrategy) => void;
  setFramePadding: (padding: number) => void;

  // Export
  finalVideoUrl: string | null;
  setFinalVideoUrl: (url: string | null) => void;
  isExporting: boolean;
  exportProgress: number;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  currentStep: 'audio' as Step,
  audioFile: null,
  audioUrl: null,
  bpm: null,
  beatOffset: 0,
  audioDuration: null,
  beats: null,
  syncMode: 'bpm' as SyncMode,
  aspectRatio: '16:9' as AspectRatio,
  beatsPerScene: 1 as BeatsPerScene,
  selectedStyle: null,
  scenes: [],
  isGenerating: false,
  generationProgress: 0,
  falApiKey: typeof window !== 'undefined' ? localStorage.getItem('fal-api-key') : null,
  backendType: (typeof window !== 'undefined' ? localStorage.getItem('backend-type') as BackendType : null) || 'fal',
  localApiAddress: (typeof window !== 'undefined' ? localStorage.getItem('local-api-address') : null) || '127.0.0.1:8188',
  localConnectionStatus: 'disconnected' as LocalConnectionStatus,
  t2iModel: (typeof window !== 'undefined' ? localStorage.getItem('t2i-model') as T2IModel : null) || 'flux-klein',
  i2vModel: (typeof window !== 'undefined' ? localStorage.getItem('i2v-model') as I2VModel : null) || 'ltx-2',
  workflowMode: (typeof window !== 'undefined' ? localStorage.getItem('workflow-mode') as WorkflowMode : null) || 'presets',
  customT2IMapping: null,
  customI2VMapping: null,
  customI2VFps: (typeof window !== 'undefined' ? Number(localStorage.getItem('custom-i2v-fps')) : 0) || 24,
  frameStrategy: (typeof window !== 'undefined' ? localStorage.getItem('frame-strategy') as FrameStrategy : null) || 'exact',
  framePadding: (typeof window !== 'undefined' ? Number(localStorage.getItem('frame-padding')) : 0) || 0,
  finalVideoUrl: null,
  isExporting: false,
  exportProgress: 0,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  setCurrentStep: (step) => set({ currentStep: step }),

  canProceed: () => {
    const state = get();
    switch (state.currentStep) {
      case 'audio':
        return state.audioFile !== null && state.bpm !== null;
      case 'style':
        return state.selectedStyle !== null;
      case 'story':
        return state.scenes.length > 0;
      case 'generate':
        return state.scenes.some(s => s.status === 'video-ready');
      case 'export':
        return state.finalVideoUrl !== null;
      default:
        return false;
    }
  },

  setAudioFile: (file) => set({ audioFile: file }),
  setAudioUrl: (url) => set({ audioUrl: url }),
  setBpm: (bpm) => set({ bpm }),
  setBeatOffset: (offset) => set({ beatOffset: offset }),
  setAudioDuration: (duration) => set({ audioDuration: duration }),
  setBeats: (beats) => set({ beats }),
  setSyncMode: (mode) => set({ syncMode: mode }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setBeatsPerScene: (beats) => set({ beatsPerScene: beats }),

  setSelectedStyle: (style) => set({ selectedStyle: style }),

  addScene: (prompt) => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      prompt,
      status: 'pending',
    };
    set((state) => ({ scenes: [...state.scenes, newScene] }));
  },

  updateScene: (id, updates) => {
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  deleteScene: (id) => {
    set((state) => ({
      scenes: state.scenes.filter((s) => s.id !== id),
    }));
  },

  reorderScenes: (startIndex, endIndex) => {
    set((state) => {
      const result = Array.from(state.scenes);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { scenes: result };
    });
  },

  setScenes: (scenes) => set({ scenes }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationProgress: (progress) => set({ generationProgress: progress }),

  setFalApiKey: (key) => {
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('fal-api-key', key);
      } else {
        localStorage.removeItem('fal-api-key');
      }
    }
    set({ falApiKey: key });
  },

  setBackendType: (type) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('backend-type', type);
    }
    set({ backendType: type });
  },

  setLocalApiAddress: (address) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('local-api-address', address);
    }
    set({ localApiAddress: address });
  },

  setLocalConnectionStatus: (status) => set({ localConnectionStatus: status }),

  setT2IModel: (model) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('t2i-model', model);
    }
    set({ t2iModel: model });
  },

  setI2VModel: (model) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('i2v-model', model);
    }
    set({ i2vModel: model });
  },

  setWorkflowMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workflow-mode', mode);
    }
    set({ workflowMode: mode });
  },

  setCustomT2IMapping: (mapping) => {
    set({ customT2IMapping: mapping });
  },

  setCustomI2VMapping: (mapping) => {
    set({ customI2VMapping: mapping });
  },

  setCustomI2VFps: (fps) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom-i2v-fps', String(fps));
    }
    set({ customI2VFps: fps });
  },

  setFrameStrategy: (strategy) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('frame-strategy', strategy);
    }
    set({ frameStrategy: strategy });
  },

  setFramePadding: (padding) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('frame-padding', String(padding));
    }
    set({ framePadding: padding });
  },

  setFinalVideoUrl: (url) => set({ finalVideoUrl: url }),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (progress) => set({ exportProgress: progress }),

  reset: () => set(initialState),
}));
