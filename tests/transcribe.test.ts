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

    expect(result.text).toBe('Hello, my name is John.');
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

    expect(result.text).toBe('Test transcript from file.');
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
      ).resolves.toMatchObject({ text: 'ok' });
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

    expect(result.text).toBe('Named buffer transcript.');
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

    expect(result.text).toBe('Pozdravljen, sem Janez.');
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

  it('returns segments from the transcription response', async () => {
    const segments = [
      { text: 'Hello.', startSecond: 0, endSecond: 1.2 },
      { text: 'My name is John.', startSecond: 1.3, endSecond: 3.0 },
    ];
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello. My name is John.',
      segments,
      durationInSeconds: 3.0,
      language: 'en',
    } as any);

    const result = await transcribe(mockModel, Buffer.from('fake-audio'));

    expect(result.segments).toEqual(segments);
  });

  it('returns durationInSeconds from the transcription response', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Test.',
      segments: [],
      durationInSeconds: 12.5,
      language: 'sl',
    } as any);

    const result = await transcribe(mockModel, Buffer.from('fake-audio'));

    expect(result.durationInSeconds).toBe(12.5);
  });

  it('returns language from the transcription response', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Pozdravljen.',
      segments: [],
      durationInSeconds: 1.0,
      language: 'sl',
    } as any);

    const result = await transcribe(mockModel, Buffer.from('fake-audio'));

    expect(result.language).toBe('sl');
  });

  it('returns undefined for durationInSeconds and language when provider omits them', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello.',
      segments: [],
      durationInSeconds: undefined,
      language: undefined,
    } as any);

    const result = await transcribe(mockModel, Buffer.from('fake-audio'));

    expect(result.durationInSeconds).toBeUndefined();
    expect(result.language).toBeUndefined();
  });

  it('passes maxRetries through to the SDK', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello.', segments: [],
    } as any);

    await transcribe(mockModel, Buffer.from('audio'), { maxRetries: 0 });

    expect(experimental_transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it('passes abortSignal through to the SDK', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello.', segments: [],
    } as any);

    const controller = new AbortController();
    await transcribe(mockModel, Buffer.from('audio'), { abortSignal: controller.signal });

    expect(experimental_transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });

  it('omits maxRetries and abortSignal when not provided', async () => {
    vi.mocked(experimental_transcribe).mockResolvedValue({
      text: 'Hello.', segments: [],
    } as any);

    await transcribe(mockModel, Buffer.from('audio'));

    const callArgs = vi.mocked(experimental_transcribe).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('maxRetries');
    expect(callArgs).not.toHaveProperty('abortSignal');
  });

  it('wraps API errors in TranscriptionError', async () => {
    vi.mocked(experimental_transcribe).mockRejectedValue(new Error('API rate limit exceeded'));

    const error = await transcribe(mockModel, Buffer.from('audio')).catch((e) => e);

    expect(error).toBeInstanceOf(TranscriptionError);
    expect(error.message).toContain('API rate limit exceeded');
    expect(error.cause).toBeInstanceOf(Error);
  });
});
