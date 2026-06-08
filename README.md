# @voicefill/core

Turn audio into structured data. Combines speech-to-text transcription and AI-powered structured output extraction into a single pipeline — with an optional, server-authoritative tool registry for data enrichment.

Works with any transcription and language model supported by the [Vercel AI SDK](https://ai-sdk.dev): OpenAI Whisper, Deepgram Nova-3, AssemblyAI, Azure Speech, and more.

## Install

```bash
npm install @voicefill/core ai zod
```

`ai` and `zod` are peer dependencies. Then install the AI SDK provider(s) you want to use:

```bash
# Pick one (or more) — provides both language and transcription models:
npm install @ai-sdk/openai       # OpenAI Whisper + GPT
npm install @ai-sdk/deepgram     # Deepgram Nova-3 (transcription)
npm install @ai-sdk/assemblyai   # AssemblyAI (transcription)
npm install @ai-sdk/azure        # Azure Speech
```

## Quick Start

`fill()` transcribes audio and extracts structured data in one call. It returns an
**outcome** — either `completed`, or (only when you use client tools) `needs_client_tools`.
Always narrow on `status` before reading `data`.

```typescript
import { createVoiceFill } from '@voicefill/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: openai.transcription('whisper-1'),
});

const out = await vf.fill('./recording.mp3', {
  schema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  prompt: 'Extract contact information from the transcribed audio.',
});

console.log(out.transcript);
// "Hi, my name is John Doe. You can reach me at john@example.com or 555-0123."

if (out.status === 'completed') {
  console.log(out.data);
  // { firstName: "John", lastName: "Doe", email: "john@example.com", phone: "555-0123" }
  console.log(out.usage);
  // { inputTokens: 312, outputTokens: 48, totalTokens: 360 }
}
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

## Passing Device Context

When the client already holds data the model needs (a saved profile, recent contacts), the
simplest and cheapest path is to fold it into the prompt via `context` — no tool round-trip
required. This is the recommended way to supply device data; reach for client tools only when
the model must fetch device data *dynamically* mid-reasoning.

```typescript
const out = await vf.extract(transcript, {
  schema: z.object({ name: z.string(), email: z.string() }),
  context: { savedProfile: { name: 'John Doe', email: 'john@saved.com' } },
});
```

`context` accepts a string or any JSON object; objects are serialized into the prompt.

## Server-Authoritative Tool Registry

For dynamic enrichment, the AI can call **tools** during extraction. For example, the user
says *"schedule a meeting with Jane"* — the AI needs to look up who Jane is.

When a **client app** (e.g. a mobile SDK) drives extraction, you don't want it deciding which
tools exist — a cracked client could invent tools, alter a tool's schema, or call tools it
shouldn't. The **registry** makes the backend the single source of truth. The client only ever
references tools **by name**; the library looks those names up in *your* registry and ignores
anything it doesn't recognize (fail closed). A client can never add or change a callable tool.

```typescript
import { createToolRegistry } from '@voicefill/core';

const registry = createToolRegistry([
  {
    name: 'searchContacts',
    description: 'Search the company directory for a contact by name',
    parameters: z.object({ query: z.string() }),
    runsOn: 'server',                       // runs here, with full DB access
    execute: async ({ query }) => db.contacts.search(query),
  },
  {
    name: 'lookupLocalDraft',
    description: 'Read a locally-saved draft for the named contact',
    parameters: z.object({ contactName: z.string() }),
    runsOn: 'client',                       // runs on the device — no execute here
  },
]);
```

- **`runsOn: 'server'`** — the tool's `execute` runs on the server, inline. `execute` is **required**.
- **`runsOn: 'client'`** — the server holds only the *definition*; execution is delegated to the
  device (e.g. to read the device's local database). `execute` must be **omitted**.

`createToolRegistry` throws if a server tool has no `execute`, a client tool *has* an `execute`,
or two tools share a name.

### Scoping which tools a caller may use

You pass the registry to `fill()` or `extract()` via options, alongside two optional filters:

| Option | Source | Effect |
|--------|--------|--------|
| `request` | the untrusted client | tool names the client wants; unknown names are dropped. Can only *narrow*. |
| `allow` | your server | per-caller allowlist; tools outside it are dropped. |

> **Security note:** with **no** `allow`, every registered tool is offered to the model. The
> client's `request` can only narrow that set, never widen it — but you should still pass a
> per-caller `allow` (derived from your own auth) in production so each caller only sees the
> tools it's entitled to. The registry controls *which tools can be called*; it does **not**
> authenticate the caller. Put your own API key / JWT check in front of these endpoints.

### Server tools only

If every tool the call uses is `runsOn: 'server'`, it's a single call — the tools run inline
and you get a `completed` outcome straight back:

```typescript
const out = await vf.fill('./recording.mp3', {
  schema: MeetingSchema,
  registry,
  allow: ['searchContacts'],       // optional: restrict this caller
  request: ['searchContacts'],     // optional: the client's requested names
});

if (out.status === 'completed') {
  console.log(out.data, out.usage);
}
```

### Client tools (the round-trip)

A client tool can't run on the server, so extraction **pauses** and asks the device to run it.
The library is **stateless** — it hands you a serializable `continuation` to store and resume
with. Keep that `continuation` server-side; only the `calls` go to the device.

```typescript
// 1. Start extraction
const out = await vf.fill(audio, { schema: MeetingSchema, registry });

if (out.status === 'needs_client_tools') {
  // 2. Store the continuation (your DB, Redis, a signed cookie — your choice), keyed by an id.
  //    It is plain JSON and survives JSON.stringify across serverless requests.
  const id = saveContinuation(out.continuation);

  // 3. Send out.calls to the device. It runs its handlers and returns results.
  //    e.g. [{ id: 'call_1', name: 'lookupLocalDraft', args: { contactName: 'Jane' } }]
  return res.json({ status: 'needs_client_tools', continuationId: id, calls: out.calls });
}
```

When the device replies with results, resume. The client's language model is reused
automatically, so you don't re-supply it:

```typescript
const continuation = loadContinuation(req.body.continuationId);

const final = await vf.resume({
  schema: MeetingSchema,
  registry,
  continuation,
  results: req.body.results,
  // results: [{ id: 'call_1', name: 'lookupLocalDraft', result: { email: '...' } }]
});

if (final.status === 'completed') {
  res.json({ data: final.data, usage: final.usage });
} else {
  // the model asked for more client tools — repeat the round-trip
}
```

Every result's `id` must match a pending call's `id`, and every pending call must be answered —
otherwise `resume` throws an `ExtractionError`.

> A client returning fake results for *its own* client tools only affects *its own* extraction;
> it can never reach server tools or other users.

### Cost & fidelity

A registry-backed extraction runs in two model passes: a **gather** step (where the model calls
tools) and a **structuring** step (where it fills your schema). Plan for at least two model calls
per `fill`/`extract` when a registry is in play. The structuring step receives the full
conversation — transcript and **verbatim tool results** — not a summary, so exact values
(emails, phone numbers, ids) returned by a tool are carried through unchanged.

## API

### `createVoiceFill(config)`

Creates a voice-fill client.

```typescript
const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),                          // Language model for extraction (required)
  transcriptionModel: openai.transcription('whisper-1'), // Transcription model (required)
});
```

Returns a client with four methods: [`fill`](#vffillaudio-options),
[`transcribe`](#vftranscribeaudio-options), [`extract`](#vfextracttext-options), and
[`resume`](#vfresumeoptions).

---

### `vf.fill(audio, options)`

Full pipeline: transcribes audio, then extracts structured data matching your schema.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `audio` | `string \| Buffer \| { buffer, name }` | File path, audio buffer, or named buffer |
| `options.schema` | `ZodType` | Zod schema defining the output shape |
| `options.prompt` | `string?` | System prompt guiding the extraction |
| `options.context` | `string \| object?` | Device-side data folded into the prompt |
| `options.registry` | `ToolRegistry?` | Server-owned tool registry. Omit for pure extraction |
| `options.request` | `string[]?` | Client-requested tool names; unknown names are dropped |
| `options.allow` | `string[]?` | Per-caller allowlist of tool names |
| `options.maxSteps` | `number?` | Max tool-calling steps (default: 5) |
| `options.maxRetries` | `number?` | Max retries per model call; 0 to disable (default: 2) |
| `options.abortSignal` | `AbortSignal?` | Cancel the request |
| `options.transcribe` | `TranscribeOptions?` | Options forwarded to the transcription step |

**Returns** a `FillOutcome`:

- `{ status: 'completed', data, usage, transcript, transcription }`
- `{ status: 'needs_client_tools', calls, continuation, transcript, transcription }`

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
| `options.maxRetries` | `number?` | Max retries; 0 to disable (default: 2) |
| `options.abortSignal` | `AbortSignal?` | Cancel the request |

**Returns:** `{ text, segments, durationInSeconds?, language? }` — full transcription metadata.
`durationInSeconds` is useful for cost calculations; `segments` are timestamped.

---

### `vf.extract(text, options)`

Extracts structured data from text. Useful when you already have a transcript or want to process
text from another source. Accepts the same options as `fill` except `transcribe`.

```typescript
const out = await vf.extract(
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

if (out.status === 'completed') {
  console.log(out.data);
  // { symptoms: ["headaches"], duration: "3 days", medications: ["ibuprofen"], hasFever: false }
}
```

**Returns** an `ExtractOutcome`:

- `{ status: 'completed', data, usage }`
- `{ status: 'needs_client_tools', calls, continuation }`

---

### `createToolRegistry(tools)`

Builds the server-side tool registry — the source of truth for callable tools. See
[Server-Authoritative Tool Registry](#server-authoritative-tool-registry). Each `RegistryTool`
has `name`, `description`, `parameters` (a Zod schema), and `runsOn: 'server' | 'client'`;
`execute` is required for server tools and forbidden for client tools.

---

### `vf.resume(options)`

Resumes a paused extraction with the device's client-tool results. Returns the same
`ExtractOutcome` union (it may pause again if the model wants more client tools). The language
model is reused from the client automatically.

| Name | Type | Description |
|------|------|-------------|
| `options.schema` | `ZodType` | Zod schema for the final output |
| `options.registry` | `ToolRegistry` | The same registry, re-supplied |
| `options.continuation` | `ExtractionContinuation` | The continuation from a `needs_client_tools` outcome |
| `options.results` | `ClientToolResult[]` | `{ id, name, result }` per call the device ran |
| `options.prompt` | `string?` | System prompt; should match the original extraction |
| `options.maxSteps` | `number?` | Max tool-calling steps (default: 5) |
| `options.maxRetries` | `number?` | Max retries; 0 to disable (default: 2) |
| `options.abortSignal` | `AbortSignal?` | Cancel the request |

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
  const out = await vf.fill(audio, { schema });
} catch (error) {
  if (error instanceof AudioFormatError) {
    // unsupported file format — error.format has the extension
  } else if (error instanceof TranscriptionError) {
    // transcription API failed — error.cause has the original error
  } else if (error instanceof ExtractionError) {
    // extraction failed (model error, schema validation, or a bad resume) — error.cause has the original
  }
}
```

## Audio Formats

Supported: `flac`, `m4a`, `mp3`, `mp4`, `mpeg`, `mpga`, `oga`, `ogg`, `wav`, `webm`

File paths and named buffers are validated before sending. Unsupported formats throw
`AudioFormatError` immediately.

When passing a `Buffer`, wrap it with the original filename so the format is detected correctly:

```typescript
// Plain buffer — sent as-is (no format validation possible)
await vf.fill(buffer, { schema });

// Named buffer — preserves original format and is validated
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
</content>
</invoke>
