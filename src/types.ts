import type { LanguageModel, TranscriptionModel } from 'ai';
import type { z } from 'zod';

export interface VoiceFillConfig {
  model: LanguageModel;
  transcriptionModel: TranscriptionModel;
}

export type AudioInput = string | Buffer | { buffer: Buffer; name: string };

import type { JSONValue } from 'ai';

export type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>;

export interface TranscribeOptions {
  providerOptions?: ProviderOptions;
}

export interface TranscribeResult {
  text: string;
}

export interface VoiceFillTool<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<unknown>;
}

export interface ExtractOptions<T extends z.ZodType> {
  schema: T;
  prompt?: string;
  tools?: VoiceFillTool[];
  maxSteps?: number;
}

export interface FillOptions<T extends z.ZodType> extends ExtractOptions<T> {
  transcribe?: TranscribeOptions;
}

export interface FillResult<T> {
  data: T;
  transcript: string;
}
