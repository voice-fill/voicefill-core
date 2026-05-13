import fs from 'node:fs';
import path from 'node:path';
import type OpenAI from 'openai';
import { toFile } from 'openai/core/uploads';
import type { AudioInput, TranscribeResult } from './types.js';

const SUPPORTED_FORMATS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']);

function validateAudioFormat(filePath: string): void {
  const ext = path.extname(filePath).slice(1).toLowerCase();
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
  return toFile(input, 'audio.webm');
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
