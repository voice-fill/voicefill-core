import { experimental_transcribe as transcribeAudio } from 'ai';
import type { TranscriptionModel } from 'ai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AudioInput, TranscribeOptions, TranscribeResult } from './types.js';
import { AudioFormatError, TranscriptionError } from './errors.js';

const SUPPORTED_FORMATS = new Set([
  'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm',
]);

function validateAudioFormat(fileName: string): void {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    throw new AudioFormatError(ext);
  }
}

async function normalizeAudioInput(input: AudioInput): Promise<Buffer> {
  if (typeof input === 'string') {
    validateAudioFormat(input);
    return readFile(input);
  }
  if (Buffer.isBuffer(input)) {
    return input;
  }
  validateAudioFormat(input.name);
  return input.buffer;
}

export async function transcribe(
  model: TranscriptionModel,
  input: AudioInput,
  options?: TranscribeOptions,
): Promise<TranscribeResult> {
  const audio = await normalizeAudioInput(input);
  try {
    const result = await transcribeAudio({
      model,
      audio,
      ...(options?.providerOptions && { providerOptions: options.providerOptions }),
      ...(options?.maxRetries !== undefined && { maxRetries: options.maxRetries }),
      ...(options?.abortSignal && { abortSignal: options.abortSignal }),
    });
    return {
      text: result.text,
      segments: result.segments,
      durationInSeconds: result.durationInSeconds,
      language: result.language,
    };
  } catch (error) {
    throw new TranscriptionError(
      `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
