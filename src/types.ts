import type { LanguageModel, TranscriptionModel } from 'ai';
import type { z } from 'zod';

/** Configuration for creating a VoiceFill client. */
export interface VoiceFillConfig {
  /** Language model used for structured data extraction (e.g. `openai('gpt-4o')`). */
  model: LanguageModel;
  /** Transcription model used for speech-to-text (e.g. `openai.transcription('whisper-1')`). */
  transcriptionModel: TranscriptionModel;
}

/**
 * Audio input accepted by transcribe and fill methods.
 * Pass a file path, a raw Buffer, or a `{ buffer, name }` object where `name` includes
 * the file extension for format validation.
 */
export type AudioInput = string | Buffer | { buffer: Buffer; name: string };

import type { JSONValue } from 'ai';

/** Provider-specific options passed through to the underlying transcription model. */
export type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>;

/**
 * Options for the transcription step.
 *
 * @example Pass a language hint and prompt to OpenAI Whisper:
 * ```ts
 * await vf.transcribe('recording.mp3', {
 *   providerOptions: {
 *     openai: { language: 'sl', prompt: 'Slovenian medical form dictation' },
 *   },
 * });
 * ```
 */
export interface TranscribeOptions {
  /** Provider-specific options forwarded to the transcription model (e.g. language hints, prompts). */
  providerOptions?: ProviderOptions;
  /** Maximum number of retries. Set to 0 to disable. Default: 2. */
  maxRetries?: number;
  /** Abort signal to cancel the transcription request. */
  abortSignal?: AbortSignal;
}

/** A timestamped segment of the transcription. */
export interface TranscribeSegment {
  /** The transcribed text for this segment. */
  text: string;
  /** Start time in seconds. */
  startSecond: number;
  /** End time in seconds. */
  endSecond: number;
}

/** Result of a standalone transcription call. */
export interface TranscribeResult {
  /** The transcribed text. */
  text: string;
  /** Timestamped segments of the transcription. */
  segments: TranscribeSegment[];
  /** Duration of the audio in seconds. Useful for cost calculations. */
  durationInSeconds?: number;
  /** Detected or specified language code (e.g. `'sl'`, `'en'`). */
  language?: string;
}

/** Token usage information from an LLM call. */
export interface TokenUsage {
  /** Number of input (prompt) tokens consumed. */
  inputTokens: number | undefined;
  /** Number of output (completion) tokens generated. */
  outputTokens: number | undefined;
  /** Total tokens (input + output). */
  totalTokens: number | undefined;
}

/** A tool the AI can call during extraction to gather additional context. */
export interface VoiceFillTool<T extends z.ZodType = z.ZodType> {
  /** Unique tool name. */
  name: string;
  /** Description shown to the AI so it knows when to call this tool. */
  description: string;
  /** Zod schema defining the tool's input parameters. */
  parameters: T;
  /** Function executed when the AI invokes this tool. */
  execute: (args: z.infer<T>) => Promise<unknown>;
}

/** Result of a standalone extraction call. */
export interface ExtractResult<T> {
  /** Structured data extracted from the text, matching the provided Zod schema. */
  data: T;
  /** Token usage from the extraction LLM call(s). */
  usage: TokenUsage;
}

/**
 * Options for the extraction step.
 *
 * @example
 * ```ts
 * await vf.extract(transcript, {
 *   schema: z.object({ name: z.string(), address: z.string() }),
 *   prompt: 'Extract patient info from a Slovenian medical form dictation.',
 * });
 * ```
 */
export interface ExtractOptions<T extends z.ZodType> {
  /** Zod schema defining the desired output structure. */
  schema: T;
  /** System prompt that tells the LLM what it's extracting and from what domain. Defaults to a generic extraction prompt. */
  prompt?: string;
  /** Tools the AI can call during extraction to enrich data (e.g. contact lookup, address validation). */
  tools?: VoiceFillTool[];
  /** Maximum number of tool-calling steps before the AI must produce a final answer. Defaults to 5. */
  maxSteps?: number;
  /** Maximum number of retries per LLM call. Set to 0 to disable. Default: 2. */
  maxRetries?: number;
  /** Abort signal to cancel the extraction request. */
  abortSignal?: AbortSignal;
}

/** Options for the combined transcribe-and-extract `fill()` method. */
export interface FillOptions<T extends z.ZodType> extends ExtractOptions<T> {
  /** Options forwarded to the transcription step. */
  transcribe?: TranscribeOptions;
}

/** Result of a `fill()` call — the extracted data plus full transcription and usage metadata. */
export interface FillResult<T> {
  /** Structured data extracted from the transcript, matching the provided Zod schema. */
  data: T;
  /** The raw transcript text (shorthand for `transcription.text`). */
  transcript: string;
  /** Full transcription result including segments, duration, and detected language. */
  transcription: TranscribeResult;
  /** Token usage from the extraction step. */
  usage: {
    /** Token usage from the LLM extraction call(s). */
    extraction: TokenUsage;
  };
}
