declare module 'essentia.js' {
  export class Essentia {
    constructor(wasmModule: unknown);
    arrayToVector(array: Float32Array): unknown;
    vectorToArray(vector: unknown): number[];
    BeatTrackerMultiFeature(audioVector: unknown, sampleRate?: number): {
      ticks: unknown;
      confidence: unknown;
    };
  }
  export const EssentiaWASM: unknown;
}
