import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../src/transcribe.js', () => ({
  transcribe: vi.fn(),
}));

vi.mock('../src/extract.js', () => ({
  extract: vi.fn(),
  resume: vi.fn(),
}));

import { createVoiceFill } from '../src/client.js';
import * as transcribeMod from '../src/transcribe.js';
import * as extractMod from '../src/extract.js';

const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
});

const mockTranscriptionModel = { modelId: 'whisper-1' } as any;
const mockLanguageModel = { modelId: 'gpt-4o-mini' } as any;

function createClient() {
  return createVoiceFill({
    transcriptionModel: mockTranscriptionModel,
    model: mockLanguageModel,
  });
}

describe('createVoiceFill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a client with transcribe, extract, fill, and resume methods', () => {
    const client = createClient();

    expect(client.transcribe).toBeTypeOf('function');
    expect(client.extract).toBeTypeOf('function');
    expect(client.fill).toBeTypeOf('function');
    expect(client.resume).toBeTypeOf('function');
  });

  it('transcribe() delegates to transcribe module with the transcription model', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'hello',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    });
    const client = createClient();

    const result = await client.transcribe(Buffer.from('audio'));

    expect(result.text).toBe('hello');
    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      undefined,
    );
  });

  it('extract() delegates to extract module with the language model and returns the outcome', async () => {
    vi.mocked(extractMod.extract).mockResolvedValue({
      status: 'completed',
      data: { name: 'John', email: 'john@test.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);
    const client = createClient();

    const outcome = await client.extract('some text', { schema: ContactSchema });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') throw new Error('unreachable');
    expect(outcome.data).toEqual({ name: 'John', email: 'john@test.com' });
    expect(extractMod.extract).toHaveBeenCalledWith(mockLanguageModel, 'some text', expect.anything());
  });

  it('fill() combines transcribe and a completed extraction', async () => {
    const transcribeResult = {
      text: 'My name is John, email john@test.com',
      segments: [{ text: 'My name is John, email john@test.com', startSecond: 0, endSecond: 3.5 }],
      durationInSeconds: 3.5,
      language: 'en',
    };
    vi.mocked(transcribeMod.transcribe).mockResolvedValue(transcribeResult);
    vi.mocked(extractMod.extract).mockResolvedValue({
      status: 'completed',
      data: { name: 'John', email: 'john@test.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const client = createClient();
    const outcome = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') throw new Error('unreachable');
    expect(outcome.transcript).toBe('My name is John, email john@test.com');
    expect(outcome.transcription).toEqual(transcribeResult);
    expect(outcome.data).toEqual({ name: 'John', email: 'john@test.com' });
    expect(outcome.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('fill() surfaces a needs_client_tools outcome with the transcript', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'Schedule with Jane',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    });
    vi.mocked(extractMod.extract).mockResolvedValue({
      status: 'needs_client_tools',
      calls: [{ id: 'c1', name: 'lookupLocalDraft', args: { contactName: 'Jane' } }],
      continuation: { messages: [], usageSoFar: {}, pending: [] },
    } as any);

    const client = createClient();
    const outcome = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(outcome.status).toBe('needs_client_tools');
    if (outcome.status !== 'needs_client_tools') throw new Error('unreachable');
    expect(outcome.transcript).toBe('Schedule with Jane');
    expect(outcome.calls).toHaveLength(1);
    const passedText = vi.mocked(extractMod.extract).mock.calls[0][1];
    expect(passedText).toBe('Schedule with Jane');
  });

  it('fill() passes transcribe options to the transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'hej',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    });
    vi.mocked(extractMod.extract).mockResolvedValue({
      status: 'completed',
      data: { name: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const client = createClient();
    await client.fill(Buffer.from('audio'), {
      schema: ContactSchema,
      transcribe: { providerOptions: { deepgram: { language: 'sl', smartFormat: true } } },
    });

    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      { providerOptions: { deepgram: { language: 'sl', smartFormat: true } } },
    );
  });

  it('resume() injects the client model and forwards to resume', async () => {
    vi.mocked(extractMod.resume).mockResolvedValue({
      status: 'completed',
      data: { ok: true },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const client = createClient();
    const continuation = { messages: [], usageSoFar: {}, pending: [] } as any;
    const reg = { select: () => [], list: () => [], get: () => undefined } as any;
    await client.resume({
      schema: ContactSchema,
      registry: reg,
      continuation,
      results: [{ id: 'c1', name: 't', result: 1 }],
    });

    expect(extractMod.resume).toHaveBeenCalledWith(
      expect.objectContaining({ model: mockLanguageModel, continuation, registry: reg }),
    );
  });
});
