# Changelog

All notable changes to `@voicefill/core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-30

Initial release.

### Added

- `createVoiceFill(config)` — client combining speech-to-text transcription with
  LLM-powered structured data extraction. Provider-agnostic via the Vercel AI SDK.
- `vf.fill(audio, options)` — transcribe audio and extract structured data in one call.
- `vf.transcribe(audio, options?)` — standalone transcription returning full metadata
  (text, timestamped segments, duration, detected language).
- `vf.extract(text, options)` — structured extraction from existing text.
- `vf.resume(options)` — resume a paused extraction with client-tool results.
- `createToolRegistry(tools)` — server-authoritative tool registry. Clients reference
  tools by name only; unknown or disallowed names are dropped (fail closed).
  `runsOn: 'server'` tools execute inline; `runsOn: 'client'` tools pause extraction and
  return a serializable `continuation` for a device round-trip.
- Discriminated-union outcomes (`completed` / `needs_client_tools`) for type-safe handling.
- Audio-format validation for file paths and named buffers.
- Error hierarchy: `VoiceFillError`, `TranscriptionError`, `ExtractionError`,
  `AudioFormatError`, with `cause` chaining.

[Unreleased]: https://github.com/amadejzr/voicefill-core/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amadejzr/voicefill-core/releases/tag/v0.1.0
