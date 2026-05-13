import OpenAI from 'openai';
import { createOpenAI } from '@ai-sdk/openai';
import type { z } from 'zod';
import type {
  AudioInput,
  VoiceFillConfig,
  TranscribeResult,
  FillOptions,
  FillResult,
  ExtractOptions,
} from './types.js';
import { transcribe as transcribeAudio } from './transcribe.js';
import { extract as extractData } from './extract.js';

export interface VoiceFillClient {
  transcribe(input: AudioInput): Promise<TranscribeResult>;
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
  const whisperClient = new OpenAI({ apiKey: config.apiKey });
  const provider = createOpenAI({ apiKey: config.apiKey });
  const model = provider(config.model ?? 'gpt-4o-mini');
  const whisperModel = config.whisperModel ?? 'whisper-1';

  return {
    async transcribe(input) {
      return transcribeAudio(whisperClient, input, whisperModel);
    },

    async extract(text, options) {
      return extractData(model, text, options);
    },

    async fill(input, options) {
      const transcript = await transcribeAudio(whisperClient, input, whisperModel);
      const data = await extractData(model, transcript.text, options);
      return { data, transcript: transcript.text };
    },
  };
}
