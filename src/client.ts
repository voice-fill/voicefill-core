import type { z } from 'zod';
import type {
  AudioInput,
  VoiceFillConfig,
  TranscribeOptions,
  TranscribeResult,
  FillOptions,
  FillResult,
  ExtractOptions,
} from './types.js';
import { transcribe as transcribeAudio } from './transcribe.js';
import { extract as extractData } from './extract.js';

export interface VoiceFillClient {
  transcribe(input: AudioInput, options?: TranscribeOptions): Promise<TranscribeResult>;
  extract<T extends z.ZodType>(
    text: string,
    options: ExtractOptions<T>,
  ): Promise<z.infer<T>>;
  fill<T extends z.ZodType>(
    input: AudioInput,
    options: FillOptions<T>,
  ): Promise<FillResult<z.infer<T>>>;
}

export function createVoiceFill(config: VoiceFillConfig): VoiceFillClient {
  return {
    async transcribe(input, options) {
      return transcribeAudio(config.transcriptionModel, input, options);
    },

    async extract(text, options) {
      return extractData(config.model, text, options);
    },

    async fill(input, options) {
      const transcript = await transcribeAudio(config.transcriptionModel, input, options.transcribe);
      const data = await extractData(config.model, transcript.text, options);
      return { data, transcript: transcript.text };
    },
  };
}
