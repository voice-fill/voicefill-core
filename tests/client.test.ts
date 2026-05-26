import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../src/transcribe.js', () => ({
  transcribe: vi.fn(),
}));

vi.mock('../src/extract.js', () => ({
  extract: vi.fn(),
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

  it('returns a client with transcribe, extract, and fill methods', () => {
    const client = createClient();

    expect(client.transcribe).toBeTypeOf('function');
    expect(client.extract).toBeTypeOf('function');
    expect(client.fill).toBeTypeOf('function');
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
    expect(transcribeMod.transcribe).toHaveBeenCalledOnce();
    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      undefined,
    );
  });

  it('extract() delegates to extract module with the language model', async () => {
    const expected = { name: 'John', email: 'john@test.com' };
    vi.mocked(extractMod.extract).mockResolvedValue({
      data: expected,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const client = createClient();

    const result = await client.extract('some text', { schema: ContactSchema });

    expect(result.data).toEqual(expected);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(extractMod.extract).toHaveBeenCalledOnce();
    expect(extractMod.extract).toHaveBeenCalledWith(
      mockLanguageModel,
      'some text',
      expect.anything(),
    );
  });

  it('transcribe() forwards options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'hej',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    });
    const client = createClient();

    await client.transcribe(Buffer.from('audio'), {
      providerOptions: { openai: { language: 'sl' } },
    });

    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      { providerOptions: { openai: { language: 'sl' } } },
    );
  });

  it('fill() combines transcribe and extract, returns full result', async () => {
    const transcribeResult = {
      text: 'My name is John, email john@test.com',
      segments: [{ text: 'My name is John, email john@test.com', startSecond: 0, endSecond: 3.5 }],
      durationInSeconds: 3.5,
      language: 'en',
    };
    vi.mocked(transcribeMod.transcribe).mockResolvedValue(transcribeResult);
    vi.mocked(extractMod.extract).mockResolvedValue({
      data: { name: 'John', email: 'john@test.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    const client = createClient();
    const result = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(result.transcript).toBe('My name is John, email john@test.com');
    expect(result.transcription).toEqual(transcribeResult);
    expect(result.data).toEqual({ name: 'John', email: 'john@test.com' });
    expect(result.usage).toEqual({
      extraction: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('fill() passes transcribe options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'hej',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    });
    vi.mocked(extractMod.extract).mockResolvedValue({
      data: { name: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    const client = createClient();
    await client.fill(Buffer.from('audio'), {
      schema: ContactSchema,
      transcribe: {
        providerOptions: { deepgram: { language: 'sl', smartFormat: true } },
      },
    });

    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      { providerOptions: { deepgram: { language: 'sl', smartFormat: true } } },
    );
  });

  it('fill() exposes transcription segments, duration, and language', async () => {
    const segments = [
      { text: 'Hello.', startSecond: 0, endSecond: 1.0 },
      { text: 'I am Jane.', startSecond: 1.1, endSecond: 2.5 },
    ];
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'Hello. I am Jane.',
      segments,
      durationInSeconds: 2.5,
      language: 'sl',
    });
    vi.mocked(extractMod.extract).mockResolvedValue({
      data: { name: 'Jane', email: '' },
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
    });

    const client = createClient();
    const result = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(result.transcription.segments).toEqual(segments);
    expect(result.transcription.durationInSeconds).toBe(2.5);
    expect(result.transcription.language).toBe('sl');
  });
});
