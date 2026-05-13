import fs from 'node:fs';
import path from 'node:path';
import type OpenAI from 'openai';
import { toFile } from 'openai/core/uploads';
import type { AudioInput, TranscribeResult } from './types.js';

const SUPPORTED_FORMATS = new Set([
  'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm',
]);

function validateAudioFormat(fileName: string): void {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    throw new Error(
      `Unsupported audio format: .${ext}. Supported: ${[...SUPPORTED_FORMATS].join(', ')}`,
    );
  }
}

async function normalizeAudioInput(input: AudioInput) {
  if (typeof input === 'string') {
    validateAudioFormat(input);
    return fs.createReadStream(input);
  }
  if (Buffer.isBuffer(input)) {
    return toFile(input, 'audio.webm');
  }
  validateAudioFormat(input.name);
  return toFile(input.buffer, input.name);
}

export async function transcribe(
  client: OpenAI,
  input: AudioInput,
  model: string,
): Promise<TranscribeResult> {
  const file = await normalizeAudioInput(input);
  const response = await client.audio.transcriptions.create({ file, model });
  return { text: response.text };
}
