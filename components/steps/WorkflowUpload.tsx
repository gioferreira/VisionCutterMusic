'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { parseWorkflowJson } from '@/lib/comfyui/workflow-parser';
import type { WorkflowValidationResult, T2IWorkflowMapping, I2VWorkflowMapping } from '@/lib/comfyui/types';

interface WorkflowUploadProps {
  type: 't2i' | 'i2v';
}

const WORKFLOW_STORAGE_KEY = {
  t2i: 'custom-t2i-workflow',
  i2v: 'custom-i2v-workflow',
};

export function WorkflowUpload({ type }: WorkflowUploadProps) {
  const {
    customT2IMapping,
    customI2VMapping,
    customI2VFps,
    setCustomT2IMapping,
    setCustomI2VMapping,
    setCustomI2VFps,
  } = useAppStore();

  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const currentMapping = type === 't2i' ? customT2IMapping : customI2VMapping;

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setValidationResult({
        isValid: false,
        isApiFormat: false,
        mapping: null,
        errors: ['Please upload a JSON file.'],
        warnings: [],
        foundNodes: [],
      });
      return;
    }

    const text = await file.text();
    const result = parseWorkflowJson(text, type);
    setValidationResult(result);
    setFileName(file.name);

    if (result.isValid && result.mapping) {
      // Store workflow JSON in localStorage
      localStorage.setItem(WORKFLOW_STORAGE_KEY[type], text);

      // Store mapping in Zustand
      if (type === 't2i') {
        setCustomT2IMapping(result.mapping as T2IWorkflowMapping);
      } else {
        setCustomI2VMapping(result.mapping as I2VWorkflowMapping);

        // If FPS was detected, use it
        const i2vMapping = result.mapping as I2VWorkflowMapping;
        if (i2vMapping.fps) {
          // Try to read FPS value from workflow
          try {
            const workflow = JSON.parse(text);
            const fpsNode = workflow[i2vMapping.fps.nodeId];
            if (fpsNode?.inputs?.[i2vMapping.fps.inputKey]) {
              setCustomI2VFps(Number(fpsNode.inputs[i2vMapping.fps.inputKey]));
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }, [type, setCustomT2IMapping, setCustomI2VMapping, setCustomI2VFps]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = useCallback(() => {
    localStorage.removeItem(WORKFLOW_STORAGE_KEY[type]);
    if (type === 't2i') {
      setCustomT2IMapping(null);
    } else {
      setCustomI2VMapping(null);
    }
    setValidationResult(null);
    setFileName(null);
  }, [type, setCustomT2IMapping, setCustomI2VMapping]);

  const label = type === 't2i' ? 'Text-to-Image' : 'Image-to-Video';
  const isLoaded = currentMapping !== null;

  return (
    <div className="space-y-3">
      <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
        {label} Workflow
      </label>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed p-4 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-[var(--cyan)] bg-[var(--cyan-soft)]'
            : isLoaded
              ? 'border-[var(--cyan)] bg-[var(--paper)]'
              : 'border-[var(--ink)] bg-[var(--paper)] hover:border-[var(--cyan)]'
          }
        `}
      >
        <input
          type="file"
          accept=".json"
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        {isLoaded ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-mono text-[var(--cyan)]">
                {fileName || 'Workflow loaded'}
              </span>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); handleClear(); }}
              className="text-xs font-mono uppercase text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-sm text-[var(--text-secondary)]">
              Drop {label} workflow JSON here
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              or click to browse
            </p>
          </div>
        )}
      </div>

      {/* Validation feedback */}
      {validationResult && (
        <div className="space-y-2">
          {/* Errors */}
          {validationResult.errors.map((error, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-[var(--red)]">
              <span className="flex-shrink-0">x</span>
              <span>{error}</span>
            </div>
          ))}

          {/* Warnings */}
          {validationResult.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-[var(--yellow)]">
              <span className="flex-shrink-0">!</span>
              <span>{warning}</span>
            </div>
          ))}

          {/* Success - Found nodes */}
          {validationResult.isValid && validationResult.foundNodes.length > 0 && (
            <div className="text-xs text-[var(--cyan)]">
              <span>Found: {validationResult.foundNodes.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* FPS input for I2V */}
      {type === 'i2v' && isLoaded && (
        <div className="pt-2">
          <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Output FPS
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={60}
              value={customI2VFps}
              onChange={(e) => setCustomI2VFps(Number(e.target.value) || 24)}
              className="w-20 px-3 py-2 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--cyan)]"
            />
            <span className="text-xs text-[var(--text-muted)]">
              Required for accurate beat sync
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
