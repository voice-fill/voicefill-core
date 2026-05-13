import { describe, it, expect } from 'vitest';
import {
  VoiceFillError,
  TranscriptionError,
  ExtractionError,
  AudioFormatError,
} from '../src/errors.js';

describe('errors', () => {
  it('VoiceFillError is an instance of Error', () => {
    const err = new VoiceFillError('something failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VoiceFillError);
    expect(err.message).toBe('something failed');
    expect(err.name).toBe('VoiceFillError');
  });

  it('TranscriptionError wraps a cause', () => {
    const cause = new Error('API timeout');
    const err = new TranscriptionError('Transcription failed', cause);
    expect(err).toBeInstanceOf(VoiceFillError);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err.name).toBe('TranscriptionError');
    expect(err.message).toBe('Transcription failed');
    expect(err.cause).toBe(cause);
  });

  it('ExtractionError wraps a cause', () => {
    const cause = new Error('rate limit');
    const err = new ExtractionError('Extraction failed', cause);
    expect(err).toBeInstanceOf(VoiceFillError);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.name).toBe('ExtractionError');
    expect(err.cause).toBe(cause);
  });

  it('AudioFormatError includes the format', () => {
    const err = new AudioFormatError('txt');
    expect(err).toBeInstanceOf(VoiceFillError);
    expect(err).toBeInstanceOf(AudioFormatError);
    expect(err.name).toBe('AudioFormatError');
    expect(err.format).toBe('txt');
    expect(err.message).toContain('txt');
  });
});
