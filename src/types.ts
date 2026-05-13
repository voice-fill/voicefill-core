import type { z } from 'zod';

export interface VoiceFillConfig {
  apiKey: string;
  model?: string;
  whisperModel?: string;
}

export type AudioInput = string | Buffer | { buffer: Buffer; name: string };

export interface TranscribeOptions {
  language?: string;
  prompt?: string;
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
