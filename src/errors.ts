/** Base error class for all VoiceFill errors. */
export class VoiceFillError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VoiceFillError';
  }
}

/** Thrown when the transcription provider fails or returns an error. */
export class TranscriptionError extends VoiceFillError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'TranscriptionError';
  }
}

/** Thrown when structured data extraction fails (e.g. LLM error or schema validation failure). */
export class ExtractionError extends VoiceFillError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'ExtractionError';
  }
}

/** Thrown when the audio file has an unsupported format. */
export class AudioFormatError extends VoiceFillError {
  /** The unsupported file extension that was provided. */
  readonly format: string;

  constructor(format: string) {
    super(
      `Unsupported audio format: .${format}. Supported: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm`,
    );
    this.name = 'AudioFormatError';
    this.format = format;
  }
}
