/**
 * Catalogue of streaming speech-recognition models VibeTalk can run.
 *
 * Every model is a streaming (online) transducer run by sherpa-onnx, so words
 * are recognised while you are still speaking. Files are pinned to an exact
 * Hugging Face revision and verified by size + SHA-256 after download.
 */

export interface ModelFile {
  name: string;
  size: number;
  sha256: string;
}

export interface ModelSpec {
  id: string;
  name: string;
  summary: string;
  /** ISO 639-1 codes the model can transcribe. */
  languages: string[];
  /** True when the model accepts a per-stream language option (and "auto"). */
  multilingual: boolean;
  featureDim: number;
  numThreads: number;
  repo: string;
  revision: string;
  files: {
    encoder: ModelFile;
    decoder: ModelFile;
    joiner: ModelFile;
    tokens: ModelFile;
  };
  license: string;
  licenseUrl: string;
  /** Peak resident memory of the whole process while dictating (measured on Apple Silicon). */
  ramMB: number;
}

const kroko = (
  lang: string,
  langName: string,
  revision: string,
  files: ModelSpec["files"],
  ramMB = 280,
): ModelSpec => ({
  id: `kroko-${lang}`,
  name: `Kroko ${lang.toUpperCase()}`,
  summary: `Ultra-light streaming Zipformer (${langName}). Fast on any CPU.`,
  languages: [lang],
  multilingual: false,
  featureDim: 80,
  numThreads: 2,
  repo: `csukuangfj/sherpa-onnx-streaming-zipformer-${lang}-kroko-2025-08-06`,
  revision,
  files,
  license: "CC-BY-SA (Kroko community model by Banafo; version not stated by the publisher)",
  licenseUrl: "https://huggingface.co/Banafo/Kroko-ASR",
  ramMB,
});

const KROKO_DECODER = 617488;
const KROKO_JOINER = 336817;

export const NEMOTRON_LANGUAGES = [
  "en", "es", "fr", "it", "pt", "nl", "de", "tr", "ru", "ar", "hi", "ja", "ko", "vi", "uk",
  "pl", "sv", "cs", "nb", "da", "bg", "fi", "hr", "sk", "zh", "hu", "ro", "et",
];

export const MODELS: ModelSpec[] = [
  kroko("en", "English", "572aaf4e2e0c603c3fc2a574d096e755a178faa1", {
    encoder: { name: "encoder.onnx", size: 70092599, sha256: "d4881c57449d581e0770fd53fa66c2fdc6cd167d92ece7c715e603defc96d9d4" },
    decoder: { name: "decoder.onnx", size: KROKO_DECODER, sha256: "455ba38466fce8d5a57e7db68a323b684079ca4d9e1dd93a740d9b2429aae3b1" },
    joiner: { name: "joiner.onnx", size: KROKO_JOINER, sha256: "d406f616736350e2a7df3e39398b78eb2fc1a2ca6973a19d3853fa3227e25b52" },
    tokens: { name: "tokens.txt", size: 6310, sha256: "396dbeb5f4858875690716084f54e90d339679d0ba3e6b5b584f3d7589254d2d" },
  }),
  kroko("es", "Spanish", "20cf7a4921613397841d31168796cade5b866585", {
    encoder: { name: "encoder.onnx", size: 154878102, sha256: "2d9f5ef87d1a5257f8a6687e21501c56f3aa2fcbfcfab9364dcc4ce4e06ae81b" },
    decoder: { name: "decoder.onnx", size: KROKO_DECODER, sha256: "d4ce176b94b25f7acc88717bc3f704fcf5d6e131aaac2e0cabab3885541181ee" },
    joiner: { name: "joiner.onnx", size: KROKO_JOINER, sha256: "dae35df88d676e320fcdb99217328e66dcf722bf11b0f2459e14ddb5b982ded5" },
    tokens: { name: "tokens.txt", size: 6385, sha256: "1be5e0a58e05d06d327df4c6b7b5e4f8aba01da6981eb016fcaceafc6a56680f" },
  }, 450),
  kroko("fr", "French", "08b84b7b7cf519be9817e9c16919d96a7a8bad91", {
    encoder: { name: "encoder.onnx", size: 70092599, sha256: "e02facae1daf6f1f13da67ea3ace7c722516d0868d1768d78c0580bc22cc0c5b" },
    decoder: { name: "decoder.onnx", size: KROKO_DECODER, sha256: "6aed547570e3ab5afc05429a017cedd3a056c16df3baa5703f02461cefa25bac" },
    joiner: { name: "joiner.onnx", size: KROKO_JOINER, sha256: "a51eec759bcdcaae2614686fa2a8b57417b2d420dd55a5a5558b388d35a9b2b6" },
    tokens: { name: "tokens.txt", size: 5415, sha256: "fedfb9c844bfb2bf14171f8184863e3d617b815a8667bdd9fc9a3149fde73298" },
  }),
  kroko("de", "German", "887db3d083240198c2d2b99fb66cfcfe6948ced8", {
    encoder: { name: "encoder.onnx", size: 70091557, sha256: "6e83993d6967ec7a3498b055b7e85ace85b5d64d1b1e8773cb29a43a11f5edb5" },
    decoder: { name: "decoder.onnx", size: 617489, sha256: "94a29592b403c53fa2231b478637da1ab4abcef7f5e46e432098416a4a3ed562" },
    joiner: { name: "joiner.onnx", size: KROKO_JOINER, sha256: "28356bff070aea51ab1d725a3278e81d19f9300f860d3248a7014292264df15a" },
    tokens: { name: "tokens.txt", size: 5606, sha256: "86e8370994ff2c01149ba8c4f8709aa93cdc18914b27a717e291e96faf39a6eb" },
  }),
  {
    id: "nemotron",
    name: "Nemotron 3.5 Streaming",
    summary:
      "NVIDIA Nemotron 3.5 ASR Streaming 0.6B (int8, 160 ms chunks). Lowest word latency (~0.3 s), 28 languages with auto-detect.",
    languages: NEMOTRON_LANGUAGES,
    multilingual: true,
    featureDim: 128,
    numThreads: 4,
    repo: "csukuangfj2/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-160ms-int8-2026-06-11",
    revision: "b3a4dbde84fba1a13cb4270e6730b525ac6a2db6",
    files: {
      encoder: { name: "encoder.int8.onnx", size: 657601518, sha256: "e1b39e5e16bef578a54ed2fba5f031438e000cc36c3ea2ca49d55699d5baebd4" },
      decoder: { name: "decoder.int8.onnx", size: 14978075, sha256: "19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0" },
      joiner: { name: "joiner.int8.onnx", size: 9504438, sha256: "4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce" },
      tokens: { name: "tokens.txt", size: 131440, sha256: "729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a" },
    },
    license: "OpenMDW-1.1 (NVIDIA)",
    licenseUrl: "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b",
    ramMB: 1500,
  },
];

export const DEFAULT_MODEL_ID = "kroko-en";

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelFiles(spec: ModelSpec): ModelFile[] {
  return [spec.files.encoder, spec.files.decoder, spec.files.joiner, spec.files.tokens];
}

export function modelDownloadSize(spec: ModelSpec): number {
  return modelFiles(spec).reduce((sum, f) => sum + f.size, 0);
}

/** "en-US" → "en", "PT_br" → "pt". "auto" stays "auto". */
export function baseLanguage(language: string): string {
  const l = language.trim().toLowerCase().replace("_", "-");
  if (l === "auto" || l === "") return "auto";
  return l.split("-")[0]!;
}

export function supportsLanguage(spec: ModelSpec, language: string): boolean {
  const base = baseLanguage(language);
  if (base === "auto") return spec.multilingual;
  return spec.languages.includes(base);
}

/**
 * Pick a model for a language when the user did not choose one explicitly:
 * the lightest model that supports it.
 */
export function autoSelectModel(language: string): ModelSpec | undefined {
  const base = baseLanguage(language);
  if (base === "auto") return getModel(DEFAULT_MODEL_ID);
  const candidates = MODELS.filter((m) => supportsLanguage(m, base));
  candidates.sort((a, b) => modelDownloadSize(a) - modelDownloadSize(b));
  return candidates[0];
}

export function allLanguages(): string[] {
  return [...new Set(MODELS.flatMap((m) => m.languages))].sort();
}
