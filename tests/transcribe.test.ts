import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioFormatError, TranscriptionError } from '../src/errors.js';

vi.mock('ai', () => ({
  experimental_transcribe: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-audio-from-file')),
}));

import { experimental_transcribe } from 'ai';
import { transcribe } from '../src/transcribe.js';

const SUPPORTED_FORMATS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

const mockModel = {} as any;

describe('transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends audio buffer and returns transcript', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello, my name is John.',
      segments: [],
    } as any);

    const result = await transcribe(mockModel, Buffer.from('fake-audio'));

    expect(result).toEqual({ text: 'Hello, my name is John.' });
    expect(experimental_transcribe).toHaveBeenCalledOnce();
    expect(experimental_transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
        audio: expect.any(Buffer),
      }),
    );
  });

  it('sends audio file path and returns transcript', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Test transcript from file.',
      segments: [],
    } as any);

    const result = await transcribe(mockModel, '/tmp/test-audio.mp3');

    expect(result).toEqual({ text: 'Test transcript from file.' });
    expect(experimental_transcribe).toHaveBeenCalledOnce();
  });

  it('throws on unsupported audio format (file path)', async () => {
    await expect(
      transcribe(mockModel, '/tmp/audio.txt'),
    ).rejects.toThrow('Unsupported audio format');
  });

  it('accepts all Whisper-supported formats', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'ok',
      segments: [],
    } as any);

    for (const ext of SUPPORTED_FORMATS) {
      await expect(
        transcribe(mockModel, `/tmp/audio.${ext}`),
      ).resolves.toEqual({ text: 'ok' });
    }
  });

  it('accepts named buffer with original filename', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Named buffer transcript.',
      segments: [],
    } as any);

    const result = await transcribe(
      mockModel,
      { buffer: Buffer.from('fake-audio'), name: 'recording.m4a' },
    );

    expect(result).toEqual({ text: 'Named buffer transcript.' });
    expect(experimental_transcribe).toHaveBeenCalledOnce();
  });

  it('throws AudioFormatError on unsupported format in named buffer', async () => {
    await expect(
      transcribe(mockModel, { buffer: Buffer.from('data'), name: 'file.txt' }),
    ).rejects.toThrow(AudioFormatError);
  });

  it('passes providerOptions through to the SDK', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Pozdravljen, sem Janez.',
      segments: [],
    } as any);

    const result = await transcribe(mockModel, Buffer.from('audio'), {
      providerOptions: { openai: { language: 'sl' } },
    });

    expect(result).toEqual({ text: 'Pozdravljen, sem Janez.' });
    expect(experimental_transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { language: 'sl' } },
      }),
    );
  });

  it('supports any provider via providerOptions', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Deepgram result.',
      segments: [],
    } as any);

    await transcribe(mockModel, Buffer.from('audio'), {
      providerOptions: { deepgram: { language: 'sl', smartFormat: true } },
    });

    expect(experimental_transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { deepgram: { language: 'sl', smartFormat: true } },
      }),
    );
  });

  it('omits providerOptions when not provided', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello.',
      segments: [],
    } as any);

    await transcribe(mockModel, Buffer.from('audio'));

    const callArgs = vi.mocked(experimental_transcribe).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('providerOptions');
  });

  it('wraps API errors in TranscriptionError', async () => {
    vi.mocked(experimental_transcribe).mockRejectedValue(new Error('API rate limit exceeded'));

    const error = await transcribe(mockModel, Buffer.from('audio')).catch((e) => e);

    expect(error).toBeInstanceOf(TranscriptionError);
    expect(error.message).toContain('API rate limit exceeded');
    expect(error.cause).toBeInstanceOf(Error);
  });
});
