import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('openai', () => ({
  default: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mock-model')),
}));

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

describe('createVoiceFill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a client with transcribe, extract, and fill methods', () => {
    const client = createVoiceFill({ apiKey: 'test-key' });

    expect(client.transcribe).toBeTypeOf('function');
    expect(client.extract).toBeTypeOf('function');
    expect(client.fill).toBeTypeOf('function');
  });

  it('transcribe() delegates to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hello' });
    const client = createVoiceFill({ apiKey: 'test-key' });

    const result = await client.transcribe(Buffer.from('audio'));

    expect(result).toEqual({ text: 'hello' });
    expect(transcribeMod.transcribe).toHaveBeenCalledOnce();
  });

  it('extract() delegates to extract module', async () => {
    const expected = { name: 'John', email: 'john@test.com' };
    vi.mocked(extractMod.extract).mockResolvedValue(expected);
    const client = createVoiceFill({ apiKey: 'test-key' });

    const result = await client.extract('some text', { schema: ContactSchema });

    expect(result).toEqual(expected);
    expect(extractMod.extract).toHaveBeenCalledOnce();
  });

  it('transcribe() forwards options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hej' });
    const client = createVoiceFill({ apiKey: 'test-key' });

    await client.transcribe(Buffer.from('audio'), { language: 'sl' });

    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { language: 'sl' },
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

    const client = createVoiceFill({ apiKey: 'test-key' });
    const result = await client.fill(Buffer.from('audio'), { schema: ContactSchema });

    expect(result.transcript).toBe('My name is John, email john@test.com');
    expect(result.data).toEqual({ name: 'John', email: 'john@test.com' });
    expect(transcribeMod.transcribe).toHaveBeenCalledOnce();
    expect(extractMod.extract).toHaveBeenCalledOnce();
  });

  it('fill() passes transcribe options to transcribe module', async () => {
    vi.mocked(transcribeMod.transcribe).mockResolvedValue({ text: 'hej' });
    vi.mocked(extractMod.extract).mockResolvedValue({ name: '', email: '' });

    const client = createVoiceFill({ apiKey: 'test-key' });
    await client.fill(Buffer.from('audio'), {
      schema: ContactSchema,
      transcribe: { language: 'sl', prompt: 'Slovenian names' },
    });

    expect(transcribeMod.transcribe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { language: 'sl', prompt: 'Slovenian names' },
    );
  });
});
