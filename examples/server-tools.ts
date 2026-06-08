/**
 * Server tools: let the model look up data mid-extraction via tools that run on YOUR backend.
 *
 * Because every tool here is `runsOn: 'server'`, the tools execute inline and `fill` returns a
 * `completed` outcome in a single call — no client round-trip.
 *
 * Run:
 *   npm install @voicefill/core ai zod @ai-sdk/openai
 *   OPENAI_API_KEY=sk-... npx tsx examples/server-tools.ts ./meeting.mp3
 */
import { createVoiceFill, createToolRegistry } from '@voicefill/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Pretend company directory. In production this is your real database.
const directory = [
  { name: 'Jane Cooper', email: 'jane.cooper@acme.test' },
  { name: 'John Doe', email: 'john.doe@acme.test' },
];

const registry = createToolRegistry([
  {
    name: 'searchContacts',
    description: 'Search the company directory for a contact by name.',
    parameters: z.object({ query: z.string() }),
    runsOn: 'server',
    execute: async ({ query }) =>
      directory.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
  },
]);

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: openai.transcription('whisper-1'),
});

const audioPath = process.argv[2] ?? './meeting.mp3';

const out = await vf.fill(audioPath, {
  schema: z.object({
    attendeeName: z.string(),
    attendeeEmail: z.string(),
    topic: z.string(),
  }),
  prompt: 'Extract the meeting attendee and topic. Use searchContacts to resolve email addresses.',
  registry,
  // In production, derive `allow` from the authenticated caller's permissions.
  allow: ['searchContacts'],
});

console.log('Transcript:', out.transcript);

if (out.status === 'completed') {
  console.log('Data:', out.data);
  console.log('Usage:', out.usage);
}
