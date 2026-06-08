/**
 * Basic usage: transcribe an audio file and extract structured contact info in one call.
 *
 * Run:
 *   npm install @voicefill/core ai zod @ai-sdk/openai
 *   OPENAI_API_KEY=sk-... npx tsx examples/basic-fill.ts ./recording.mp3
 */
import { createVoiceFill } from '@voicefill/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: openai.transcription('whisper-1'),
});

const audioPath = process.argv[2] ?? './recording.mp3';

const out = await vf.fill(audioPath, {
  schema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  prompt: 'Extract contact information from the transcribed audio.',
});

console.log('Transcript:', out.transcript);

// Always narrow on `status` before reading `data` — without client tools it is always 'completed'.
if (out.status === 'completed') {
  console.log('Data:', out.data);
  console.log('Usage:', out.usage);
}
