import type { LanguageModel, TranscriptionModel, ModelMessage } from 'ai';
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

/**
 * Where a registered tool executes.
 * - `'server'` — runs inline on the host backend; must define `execute`.
 * - `'client'` — runs on the end-user device (Flutter app); must NOT define `execute`.
 *   The server only holds the declaration so the model knows the tool exists.
 */
export type ToolRunsOn = 'server' | 'client';

/**
 * A tool in the server-side registry — the single source of truth for what the model
 * may call. Clients reference tools by name only; they never supply a definition or an
 * `execute`, so a cracked client can neither invent a tool nor alter one.
 *
 * `execute` is required for `runsOn: 'server'` and forbidden for `runsOn: 'client'`
 * (client tools run on the device; the server cannot execute them).
 */
export interface RegistryTool<T extends z.ZodType = z.ZodType> {
  /** Unique tool name. */
  name: string;
  /** Description shown to the model so it knows when to call this tool. */
  description: string;
  /** Zod schema defining the tool's input parameters — the contract shown to the model. */
  parameters: T;
  /** Where the tool runs. */
  runsOn: ToolRunsOn;
  /** Server-side execution. Required iff `runsOn === 'server'`. */
  execute?: (args: z.infer<T>) => Promise<unknown>;
}

/** Resolves requested tool names against the registry. Reads only names — never client definitions. */
export interface ToolRegistry {
  /** All registered tools. */
  list(): RegistryTool[];
  /** Look up one tool by name. */
  get(name: string): RegistryTool | undefined;
  /**
   * Pick the tools to offer the model.
   * @param opts.request - client-requested names; unknown names are dropped (fail closed).
   * @param opts.allow - server allowlist for the authenticated caller; tools outside it are dropped.
   * Omitting both returns the full registry.
   */
  select(opts?: { request?: string[]; allow?: string[] }): RegistryTool[];
}

/** A client tool the model wants run on the device. */
export interface ClientToolCall {
  /** Tool-call id — the device must echo it back in the matching result. */
  id: string;
  /** Registered tool name. */
  name: string;
  /** Arguments the model produced for this call. */
  args: unknown;
}

/** The device's answer for one client tool call. */
export interface ClientToolResult {
  /** Must match the `id` of the originating {@link ClientToolCall}. */
  id: string;
  /** Registered tool name. */
  name: string;
  /** Whatever the device handler returned. */
  result: unknown;
}

/**
 * A JSON-serializable continuation of a paused extraction, returned to the caller when the
 * model calls a client tool. The library holds no state — the caller stores this however it
 * likes (DB row, cache, signed cookie) and passes it back to {@link ResumeOptions}. It carries
 * only conversation state; the `model`, `schema`, and `registry` are re-supplied on resume, so
 * it survives `JSON.stringify` and works across serverless requests. Keep it server-side —
 * never send it to the device.
 */
export interface ExtractionContinuation {
  /** Conversation so far, including the model's pending tool-call message. */
  messages: ModelMessage[];
  /** Token usage accumulated up to the pause. */
  usageSoFar: TokenUsage;
  /** Client tool calls awaiting results from the device. */
  pending: ClientToolCall[];
  /** Client-requested tool names, carried so resume offers the same tools. */
  request?: string[];
  /** Server allowlist, carried so resume re-applies the same restriction. */
  allow?: string[];
}

/**
 * Options for extraction.
 *
 * Pure extraction needs only a `schema`. To let the model call tools, pass a server-owned
 * `registry` plus the client's requested tool names (`request`) and, optionally, a
 * per-caller `allow` list. Unknown requested names are dropped (fail closed).
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
  /** System prompt that tells the LLM what it's extracting. Defaults to a generic extraction prompt. */
  prompt?: string;
  /**
   * Extra context to give the model up front — e.g. device-local data the client gathered
   * before the call (saved profile, recent contacts). Folded into the prompt; no tool
   * round-trip needed. This is the recommended way to supply device data; reach for client
   * tools only when the model must fetch device data *dynamically* mid-reasoning.
   */
  context?: string | Record<string, unknown>;
  /** Server-side tool registry — the source of truth for callable tools. Omit for pure extraction. */
  registry?: ToolRegistry;
  /** Client-requested tool names (from the untrusted client). Unknown names are dropped. */
  request?: string[];
  /** Server allowlist for the authenticated caller. */
  allow?: string[];
  /** Maximum tool-calling steps before the AI must produce a final answer. Defaults to 5. */
  maxSteps?: number;
  /** Maximum retries per LLM call. Set to 0 to disable. Default: 2. */
  maxRetries?: number;
  /** Abort signal to cancel the extraction request. */
  abortSignal?: AbortSignal;
}

/**
 * Outcome of an extraction — either finished, or paused waiting on the device to run client
 * tools. On `needs_client_tools`, send `calls` to the device, then pass the device's results
 * plus `continuation` to {@link resume}.
 */
export type ExtractOutcome<T> =
  | { status: 'completed'; data: T; usage: TokenUsage }
  | { status: 'needs_client_tools'; calls: ClientToolCall[]; continuation: ExtractionContinuation };

/** Options for resuming a paused extraction with client tool results. */
export interface ResumeOptions<T extends z.ZodType> {
  /** Language model — re-supplied by the caller (not stored in the continuation). */
  model: LanguageModel;
  /** Zod schema for the final structured output. */
  schema: T;
  /** The server-side tool registry — re-supplied so the model can call tools again. */
  registry: ToolRegistry;
  /** The continuation returned by the paused {@link ExtractOutcome}. */
  continuation: ExtractionContinuation;
  /** The device's answers for the pending client tool calls. */
  results: ClientToolResult[];
  /** System prompt; should match the original extraction. */
  prompt?: string;
  /** Maximum tool-calling steps. Defaults to 5. */
  maxSteps?: number;
  /** Maximum retries per LLM call. Set to 0 to disable. Default: 2. */
  maxRetries?: number;
  /** Abort signal to cancel the request. */
  abortSignal?: AbortSignal;
}

/** Options for the combined transcribe-and-extract `fill()` method. */
export interface FillOptions<T extends z.ZodType> extends ExtractOptions<T> {
  /** Options forwarded to the transcription step. */
  transcribe?: TranscribeOptions;
}

/** Outcome of a `fill()` call — an {@link ExtractOutcome} plus the transcription metadata. */
export type FillOutcome<T> =
  | {
      status: 'completed';
      data: T;
      usage: TokenUsage;
      transcript: string;
      transcription: TranscribeResult;
    }
  | {
      status: 'needs_client_tools';
      calls: ClientToolCall[];
      continuation: ExtractionContinuation;
      transcript: string;
      transcription: TranscribeResult;
    };
