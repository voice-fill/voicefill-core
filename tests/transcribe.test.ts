import { describe, it, expect, vi } from 'vitest';

vi.mock('node:fs', () => ({
  default: { createReadStream: vi.fn().mockReturnValue('fake-stream') },
}));

import { transcribe } from '../src/transcribe.js';

const SUPPORTED_FORMATS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];

function createMockClient(transcriptText: string) {
  return {
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: transcriptText }),
      },
    },
  } as any;
}

describe('transcribe', () => {
  it('sends audio buffer to Whisper and returns transcript', async () => {
    const mock = createMockClient('Hello, my name is John.');
    const result = await transcribe(mock, Buffer.from('fake-audio'), 'whisper-1');

    expect(result).toEqual({ text: 'Hello, my name is John.' });
    expect(mock.audio.transcriptions.create).toHaveBeenCalledOnce();
    expect(mock.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'whisper-1' }),
    );
  });

  it('sends audio file path to Whisper and returns transcript', async () => {
    const mock = createMockClient('Test transcript from file.');
    const result = await transcribe(mock, '/tmp/test-audio.mp3', 'whisper-1');

    expect(result).toEqual({ text: 'Test transcript from file.' });
    expect(mock.audio.transcriptions.create).toHaveBeenCalledOnce();
  });

  it('throws on unsupported audio format (file path)', async () => {
    const mock = createMockClient('');

    await expect(
      transcribe(mock, '/tmp/audio.txt', 'whisper-1'),
    ).rejects.toThrow('Unsupported audio format');
  });

  it('accepts all Whisper-supported formats', async () => {
    const mock = createMockClient('ok');

    for (const ext of SUPPORTED_FORMATS) {
      await expect(
        transcribe(mock, `/tmp/audio.${ext}`, 'whisper-1'),
      ).resolves.toEqual({ text: 'ok' });
    }
  });
});
