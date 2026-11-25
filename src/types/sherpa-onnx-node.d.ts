// Minimal typings for the parts of sherpa-onnx-node that VibeTalk uses.
// The package ships JSDoc only (see node_modules/sherpa-onnx-node/types.js).
declare module "sherpa-onnx-node" {
  export interface Waveform {
    samples: Float32Array;
    sampleRate: number;
  }

  export interface OnlineTransducerModelConfig {
    encoder: string;
    decoder: string;
    joiner: string;
  }

  export interface OnlineRecognizerConfig {
    featConfig: { sampleRate: number; featureDim: number };
    modelConfig: {
      transducer: OnlineTransducerModelConfig;
      tokens: string;
      numThreads?: number;
      provider?: string;
      debug?: number;
      modelType?: string;
    };
    decodingMethod?: "greedy_search" | "modified_beam_search";
    maxActivePaths?: number;
    enableEndpoint?: boolean | number;
    rule1MinTrailingSilence?: number;
    rule2MinTrailingSilence?: number;
    rule3MinUtteranceLength?: number;
    hotwordsFile?: string;
    hotwordsScore?: number;
  }

  export interface OnlineRecognizerResult {
    text: string;
    tokens: string[];
    timestamps: number[];
    num_trailing_blanks?: number;
    start_time?: number;
    is_final?: boolean;
    is_eof?: boolean;
  }

  export class OnlineStream {
    acceptWaveform(obj: Waveform): void;
    inputFinished(): void;
    setOption(key: string, value: string): void;
    getOption(key: string): string;
    hasOption(key: string): boolean;
  }

  export class OnlineRecognizer {
    constructor(config: OnlineRecognizerConfig);
    readonly config: OnlineRecognizerConfig;
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    isEndpoint(stream: OnlineStream): boolean;
    reset(stream: OnlineStream): void;
    getResult(stream: OnlineStream): OnlineRecognizerResult;
  }

  export function readWave(filename: string): Waveform;

  export const version: string;
  export const onnxruntimeVersion: string;

  const sherpa: {
    OnlineRecognizer: typeof OnlineRecognizer;
    readWave: typeof readWave;
    version: string;
    onnxruntimeVersion: string;
  };
  export default sherpa;
}
