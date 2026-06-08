# Examples

Runnable examples for `@voicefill/core`. They are illustrative and are **not** part of the
published package (only `dist/` is shipped).

| File | Shows |
|------|-------|
| [`basic-fill.ts`](./basic-fill.ts) | Transcribe + extract structured data in one call. |
| [`server-tools.ts`](./server-tools.ts) | A registry tool that runs on your backend; completes in a single call. |
| [`client-round-trip.ts`](./client-round-trip.ts) | The client-tool pause/resume round-trip, as two Express handlers. |

## Running

```bash
npm install @voicefill/core ai zod @ai-sdk/openai
# client-round-trip.ts also needs: npm install express

OPENAI_API_KEY=sk-... npx tsx examples/basic-fill.ts ./recording.mp3
```

Swap `@ai-sdk/openai` for any [Vercel AI SDK](https://ai-sdk.dev) provider — the transcription
and language models are independent.
