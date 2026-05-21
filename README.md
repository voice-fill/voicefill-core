# @voicefill/core

Turn audio into structured data. Combines speech-to-text transcription and AI-powered structured output extraction into a single pipeline — with optional tool calling for data enrichment.

Works with any transcription provider supported by the [Vercel AI SDK](https://ai-sdk.dev): OpenAI Whisper, Deepgram Nova-3, AssemblyAI, Azure Speech, and more.

## Install

```bash
npm install @voicefill/core ai zod
```

Then install the AI SDK provider(s) you want to use:

```bash
# Pick one (or more) transcription providers:
npm install @ai-sdk/openai       # OpenAI Whisper
npm install @ai-sdk/deepgram     # Deepgram Nova-3
npm install @ai-sdk/assemblyai   # AssemblyAI
npm install @ai-sdk/azure        # Azure Speech
```

## Quick Start

```typescript
import { createVoiceFill } from '@voicefill/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: openai.transcription('whisper-1'),
});

const result = await vf.fill('./recording.mp3', {
  schema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  prompt: 'Extract contact information from the transcribed audio.',
});

console.log(result.transcript);
// "Hi, my name is John Doe. You can reach me at john@example.com or 555-0123."

console.log(result.data);
// { firstName: "John", lastName: "Doe", email: "john@example.com", phone: "555-0123" }
```

### Switching Providers

The transcription and language models are independent — swap either one without changing anything else:

```typescript
import { deepgram } from '@ai-sdk/deepgram';
import { openai } from '@ai-sdk/openai';

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: deepgram.transcription('nova-3'),
});
```

Provider-specific options (language, formatting, etc.) are passed through `providerOptions`:

```typescript
// OpenAI Whisper
await vf.transcribe(audio, {
  providerOptions: { openai: { language: 'sl' } },
});

// Deepgram
await vf.transcribe(audio, {
  providerOptions: { deepgram: { language: 'sl', smartFormat: true } },
});

// AssemblyAI
await vf.transcribe(audio, {
  providerOptions: { assemblyai: { languageCode: 'sl' } },
});
```

## Tool Calling

Sometimes the AI needs more than just the transcript to fill in the data. For example, the user says *"schedule a meeting with Jane"* — the AI needs to look up who Jane is.

Define tools that the AI can call during extraction:

```typescript
const result = await vf.fill('./recording.mp3', {
  schema: z.object({
    title: z.string(),
    attendeeName: z.string(),
    attendeeEmail: z.string(),
    department: z.string(),
  }),
  prompt: 'Schedule a meeting based on what the user said.',
  tools: [
    {
      name: 'searchContacts',
      description: 'Search the company directory for a contact by name',
      parameters: z.object({
        query: z.string().describe('Name or partial name to search for'),
      }),
      execute: async ({ query }) => {
        return db.contacts.search(query);
      },
    },
  ],
  maxSteps: 5, // max tool calls before returning (default: 5)
});
```

The AI will:
1. Transcribe the audio
2. Read the transcript and decide it needs to look up "Jane"
3. Call `searchContacts({ query: "Jane" })` → gets `{ name: "Jane Smith", email: "jane@acme.com", department: "Marketing" }`
4. Return the structured data with real contact details filled in

Tools work with both `fill()` (audio input) and `extract()` (text input).

### Defining Tools

Each tool needs:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique name the AI uses to call this tool |
| `description` | `string` | Explains when and why to use this tool |
| `parameters` | `ZodType` | Zod schema for the tool's input |
| `execute` | `(args) => Promise<unknown>` | Function that runs when the AI calls the tool |

The `execute` function can return anything — the AI sees the result and uses it to fill the schema.

## API

### `createVoiceFill(config)`

Creates a voice-fill client.

```typescript
import { openai } from '@ai-sdk/openai';

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),                    // Language model for extraction (required)
  transcriptionModel: openai.transcription('whisper-1'), // Transcription model (required)
});
```

Returns a client with three methods: [`fill`](#vffillaudio-options), [`transcribe`](#vftranscribeaudio-options), and [`extract`](#vfextracttext-options).

---

### `vf.fill(audio, options)`

Full pipeline: transcribes audio, then extracts structured data matching your schema.

```typescript
const result = await vf.fill('./interview.mp3', {
  schema: z.object({
    candidateName: z.string(),
    yearsExperience: z.number(),
    skills: z.array(z.string()),
    recommendation: z.enum(['hire', 'pass', 'undecided']),
  }),
  prompt: 'Extract candidate details from this interview recording.',
});

result.data        // typed object matching your schema
result.transcript  // raw transcript text
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `audio` | `string \| Buffer \| { buffer, name }` | File path, audio buffer, or named buffer |
| `options.schema` | `ZodType` | Zod schema defining the output shape |
| `options.prompt` | `string?` | System prompt guiding the extraction |
| `options.tools` | `VoiceFillTool[]?` | Tools the AI can call during extraction |
| `options.maxSteps` | `number?` | Max tool call rounds (default: 5) |
| `options.transcribe` | `TranscribeOptions?` | Options passed to the transcription step |

**Returns:** `{ data: T, transcript: string }` where `T` is inferred from your schema.

---

### `vf.transcribe(audio, options?)`

Transcribes audio to text.

```typescript
const result = await vf.transcribe('./meeting.wav');
console.log(result.text);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `audio` | `string \| Buffer \| { buffer, name }` | File path, audio buffer, or named buffer |
| `options.providerOptions` | `ProviderOptions?` | Provider-specific transcription options |

**Returns:** `{ text: string }`

---

### `vf.extract(text, options)`

Extracts structured data from text. Useful when you already have a transcript or want to process text from another source.

```typescript
const data = await vf.extract(
  'The patient reports headaches for 3 days, no fever, taking ibuprofen.',
  {
    schema: z.object({
      symptoms: z.array(z.string()),
      duration: z.string(),
      medications: z.array(z.string()),
      hasFever: z.boolean(),
    }),
  },
);
// { symptoms: ["headaches"], duration: "3 days", medications: ["ibuprofen"], hasFever: false }
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | Text to extract data from |
| `options.schema` | `ZodType` | Zod schema defining the output shape |
| `options.prompt` | `string?` | System prompt guiding the extraction |
| `options.tools` | `VoiceFillTool[]?` | Tools the AI can call during extraction |
| `options.maxSteps` | `number?` | Max tool call rounds (default: 5) |

**Returns:** Typed object matching your schema.

## Error Handling

All errors extend `VoiceFillError` for easy catching:

```typescript
import {
  VoiceFillError,
  TranscriptionError,
  ExtractionError,
  AudioFormatError,
} from '@voicefill/core';

try {
  const result = await vf.fill(audio, { schema });
} catch (error) {
  if (error instanceof AudioFormatError) {
    // unsupported file format — error.format has the extension
  } else if (error instanceof TranscriptionError) {
    // transcription API failed — error.cause has the original error
  } else if (error instanceof ExtractionError) {
    // structured output extraction failed — error.cause has the original error
  }
}
```

## Audio Formats

Supported: `flac`, `m4a`, `mp3`, `mp4`, `mpeg`, `mpga`, `oga`, `ogg`, `wav`, `webm`

File paths are validated before sending. Unsupported formats throw `AudioFormatError` immediately.

When passing a `Buffer`, wrap it with the original filename so the format is detected correctly:

```typescript
// Plain buffer — sent as-is
await vf.fill(buffer, { schema });

// Named buffer — preserves original format
await vf.fill({ buffer, name: 'recording.m4a' }, { schema });
```

## Schema Design Tips

**Use descriptive field names.** `yearsOfExperience` extracts better than `yoe`.

**Use `z.string()` for fields the user might not mention.** Missing fields return empty strings rather than throwing.

**Use `z.optional()` for truly optional data:**

```typescript
z.object({
  name: z.string(),                  // always attempted
  nickname: z.string().optional(),   // omitted if not mentioned
})
```

**Use enums to constrain outputs:**

```typescript
z.object({
  priority: z.enum(['low', 'medium', 'high']),
  category: z.enum(['bug', 'feature', 'question']),
})
```

## License

MIT
