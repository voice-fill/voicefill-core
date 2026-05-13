import type { z } from 'zod';

export interface VoiceFillConfig {
  apiKey: string;
  model?: string;
  whisperModel?: string;
}

export type AudioInput = string | Buffer;

export interface TranscribeResult {
  text: string;
}

export interface ExtractOptions<T extends z.ZodType> {
  schema: T;
  prompt?: string;
}

export interface FillOptions<T extends z.ZodType> extends ExtractOptions<T> {}

export interface FillResult<T> {
  data: T;
  transcript: string;
}
