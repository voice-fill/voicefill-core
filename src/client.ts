import type { z } from 'zod';
import type {
  AudioInput,
  VoiceFillConfig,
  TranscribeOptions,
  TranscribeResult,
  ExtractOptions,
  ExtractOutcome,
  FillOptions,
  FillOutcome,
  ResumeOptions,
} from './types.js';
import { transcribe as transcribeAudio } from './transcribe.js';
import { extract as extractData, resume as resumeData } from './extract.js';

/** The VoiceFill client returned by {@link createVoiceFill}. */
export interface VoiceFillClient {
  /** Transcribe audio to text without extraction. */
  transcribe(input: AudioInput, options?: TranscribeOptions): Promise<TranscribeResult>;
  /**
   * Extract structured data from text. Returns a `completed` outcome, or `needs_client_tools`
   * when the model calls a client tool (pass the continuation to {@link VoiceFillClient.resume}).
   */
  extract<T extends z.ZodType>(
    text: string,
    options: ExtractOptions<T>,
  ): Promise<ExtractOutcome<z.infer<T>>>;
  /** Transcribe audio and extract structured data in a single call. */
  fill<T extends z.ZodType>(
    input: AudioInput,
    options: FillOptions<T>,
  ): Promise<FillOutcome<z.infer<T>>>;
  /** Resume a paused extraction with client tool results. The client's model is used automatically. */
  resume<T extends z.ZodType>(
    options: Omit<ResumeOptions<T>, 'model'>,
  ): Promise<ExtractOutcome<z.infer<T>>>;
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
 * const out = await vf.fill('recording.mp3', {
 *   schema: z.object({ name: z.string(), email: z.string().email() }),
 * });
 * if (out.status === 'completed') console.log(out.data);
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
      const transcription = await transcribeAudio(
        config.transcriptionModel, input, options.transcribe,
      );
      const outcome = await extractData(config.model, transcription.text, options);

      if (outcome.status === 'completed') {
        return {
          status: 'completed',
          data: outcome.data,
          usage: outcome.usage,
          transcript: transcription.text,
          transcription,
        };
      }

      return {
        status: 'needs_client_tools',
        calls: outcome.calls,
        continuation: outcome.continuation,
        transcript: transcription.text,
        transcription,
      };
    },

    async resume(options) {
      return resumeData({ ...options, model: config.model });
    },
  };
}
