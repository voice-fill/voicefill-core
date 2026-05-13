export class VoiceFillError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VoiceFillError';
  }
}

export class TranscriptionError extends VoiceFillError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'TranscriptionError';
  }
}

export class ExtractionError extends VoiceFillError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'ExtractionError';
  }
}

export class AudioFormatError extends VoiceFillError {
  readonly format: string;

  constructor(format: string) {
    super(
      `Unsupported audio format: .${format}. Supported: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm`,
    );
    this.name = 'AudioFormatError';
    this.format = format;
  }
}
