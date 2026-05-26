import type { z } from 'zod';
import type {
  AudioInput,
  VoiceFillConfig,
  TranscribeOptions,
  TranscribeResult,
  FillOptions,
  FillResult,
  ExtractOptions,
  ExtractResult,
} from './types.js';
import { transcribe as transcribeAudio } from './transcribe.js';
import { extract as extractData } from './extract.js';

/** The VoiceFill client returned by {@link createVoiceFill}. */
export interface VoiceFillClient {
  /** Transcribe audio to text without extraction. */
  transcribe(input: AudioInput, options?: TranscribeOptions): Promise<TranscribeResult>;
  /** Extract structured data from plain text using a Zod schema. */
  extract<T extends z.ZodType>(
    text: string,
    options: ExtractOptions<T>,
  ): Promise<ExtractResult<z.infer<T>>>;
  /** Transcribe audio and extract structured data in a single call. */
  fill<T extends z.ZodType>(
    input: AudioInput,
    options: FillOptions<T>,
  ): Promise<FillResult<z.infer<T>>>;
}

/**
 * Create a VoiceFill client that combines speech-to-text transcription
 * with LLM-powered structured data extraction.
 *
 * @example
 * ```ts
 * import { createVoiceFill } from '@voicefill/core';
 * import { openai } from '@ai-sdk/openai';
 * import { z } from 'zod';
 *
 * const vf = createVoiceFill({
 *   transcriptionModel: openai.transcription('whisper-1'),
 *   model: openai('gpt-4o'),
 * });
 *
 * const { data, transcript } = await vf.fill('recording.mp3', {
 *   schema: z.object({ name: z.string(), email: z.string().email() }),
 * });
 * ```
 */
export function createVoiceFill(config: VoiceFillConfig): VoiceFillClient {
  return {
    async transcribe(input, options) {
      return transcribeAudio(config.transcriptionModel, input, options);
    },

    async extract(text, options) {
      return extractData(config.model, text, options);
    },

    async fill(input, options) {
      const transcription = await transcribeAudio(config.transcriptionModel, input, options.transcribe);
      const extractResult = await extractData(config.model, transcription.text, options);
      return {
        data: extractResult.data,
        transcript: transcription.text,
        transcription,
        usage: { extraction: extractResult.usage },
      };
    },
  };
}
