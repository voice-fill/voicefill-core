/**
 * Client tools: the round-trip. A client tool runs on the end-user device (e.g. a Flutter app
 * reading its local database), so extraction PAUSES and asks the device to run it.
 *
 * The library is stateless: on `needs_client_tools` you get a serializable `continuation` to
 * store server-side, plus the `calls` to send to the device. When the device replies, you
 * `resume`. This example wires that into two Express handlers.
 *
 * Run:
 *   npm install @voicefill/core ai zod @ai-sdk/openai express
 *   OPENAI_API_KEY=sk-... npx tsx examples/client-round-trip.ts
 */
import express from 'express';
import { createVoiceFill, createToolRegistry } from '@voicefill/core';
import type { ExtractionContinuation } from '@voicefill/core';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const MeetingSchema = z.object({
  attendeeName: z.string(),
  attendeeEmail: z.string(),
  topic: z.string(),
});

const registry = createToolRegistry([
  {
    name: 'lookupLocalContact',
    description: "Read the named contact from the device's local address book.",
    parameters: z.object({ contactName: z.string() }),
    runsOn: 'client', // runs on the device — no `execute` here.
  },
]);

const vf = createVoiceFill({
  model: openai('gpt-4o-mini'),
  transcriptionModel: openai.transcription('whisper-1'),
});

// Toy continuation store. Use Redis / your DB / a signed cookie in production.
const store = new Map<string, ExtractionContinuation>();
let nextId = 1;

const app = express();
app.use(express.json());

// 1. Start extraction. The device uploads audio (here, a path for brevity).
app.post('/extract', async (req, res) => {
  const out = await vf.fill(req.body.audioPath, { schema: MeetingSchema, registry });

  if (out.status === 'needs_client_tools') {
    const continuationId = String(nextId++);
    store.set(continuationId, out.continuation); // keep server-side, never send to device
    return res.json({
      status: 'needs_client_tools',
      continuationId,
      calls: out.calls, // [{ id, name: 'lookupLocalContact', args: { contactName } }]
    });
  }

  res.json({ status: 'completed', data: out.data, usage: out.usage });
});

// 2. The device ran its handlers and posts the results back. Resume.
app.post('/resume', async (req, res) => {
  const continuation = store.get(req.body.continuationId);
  if (!continuation) return res.status(404).json({ error: 'unknown continuationId' });

  const final = await vf.resume({
    schema: MeetingSchema,
    registry,
    continuation,
    results: req.body.results, // [{ id, name: 'lookupLocalContact', result: { email } }]
  });

  if (final.status === 'completed') {
    store.delete(req.body.continuationId);
    return res.json({ status: 'completed', data: final.data, usage: final.usage });
  }

  // The model asked for more client tools — store the new continuation and round-trip again.
  store.set(req.body.continuationId, final.continuation);
  res.json({ status: 'needs_client_tools', continuationId: req.body.continuationId, calls: final.calls });
});

app.listen(3000, () => console.log('listening on http://localhost:3000'));
