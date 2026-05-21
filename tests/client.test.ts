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
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hello' });
    const client = createClient();

    const result = await client.transcribe(Buffer.from('audio'));

    expect(result).toEqual({ text: 'hello' });
    expect(transcribeMod.transcribe).toHaveBeenCalledOnce();
    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      mockTranscriptionModel,
      expect.anything(),
      undefined,
    );
  });

  it('extract() delegates to extract module with the language model', async () => {
    const expected = { name: 'John', email: 'john@test.com' };
    vi.mocked(extractMod.extract).mockResolvedValue(expected);
    const client = createClient();

    const result = await client.extract('some text', { schema: ContactSchema });

    expect(result).toEqual(expected);
    expect(extractMod.extract).toHaveBeenCalledOnce();
    expect(extractMod.extract).toHaveBeenCalledWith(
      mockLanguageModel,
      'some text',
      expect.anything(),
    );
  });

  it('transcribe() forwards options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hej' });
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

  it('fill() combines transcribe and extract, returns both', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({
      text: 'My name is John, email john@test.com',
    });
    vi.mocked(extractMod.extract).mockResolvedValue({
      name: 'John',
      email: 'john@test.com',
    });

    const client = createClient();
    const result = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(result.transcript).toBe('My name is John, email john@test.com');
    expect(result.data).toEqual({ name: 'John', email: 'john@test.com' });
    expect(transcribeMod.transcribe).toHaveBeenCalledOnce();
    expect(extractMod.extract).toHaveBeenCalledOnce();
  });

  it('fill() passes transcribe options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hej' });
    vi.mocked(extractMod.extract).mockResolvedValue({ name: '', email: '' });

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
});
