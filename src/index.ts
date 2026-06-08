export { createVoiceFill } from './client.js';
export type { VoiceFillClient } from './client.js';
export { createToolRegistry } from './registry.js';
export { extract, resume } from './extract.js';
export { transcribe } from './transcribe.js';
export type {
  VoiceFillConfig,
  AudioInput,
  ProviderOptions,
  TranscribeOptions,
  TranscribeSegment,
  TranscribeResult,
  TokenUsage,
  ToolRunsOn,
  RegistryTool,
  ToolRegistry,
  ClientToolCall,
  ClientToolResult,
  ExtractionContinuation,
  ExtractOptions,
  ExtractOutcome,
  ResumeOptions,
  FillOptions,
  FillOutcome,
} from './types.js';
export {
  VoiceFillError,
  TranscriptionError,
  ExtractionError,
  AudioFormatError,
} from './errors.js';
