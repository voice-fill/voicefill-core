import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  tool: vi.fn((def: any) => def),
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));

import { generateObject, generateText } from 'ai';
import { extract, resume } from '../src/extract.js';
import { createToolRegistry } from '../src/registry.js';
import { ExtractionError } from '../src/errors.js';

const MeetingSchema = z.object({ attendeeName: z.string(), attendeeEmail: z.string() });

const registry = createToolRegistry([
  {
    name: 'lookupLocalDraft',
    description: 'Read a local draft',
    parameters: z.object({ contactName: z.string() }),
    runsOn: 'client',
  },
]);

describe('extract — client tool round-trip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns needs_client_tools when the model calls a client tool', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'tool-calls',
      text: '',
      toolCalls: [{ toolCallId: 'c1', toolName: 'lookupLocalDraft', input: { contactName: 'Jane' } }],
      response: { messages: [{ role: 'assistant', content: 'tool-call-msg' }] },
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);

    const outcome = await extract({} as any, 'Schedule with Jane', {
      schema: MeetingSchema,
      registry,
      request: ['lookupLocalDraft'],
    });

    expect(outcome.status).toBe('needs_client_tools');
    if (outcome.status !== 'needs_client_tools') throw new Error('unreachable');
    expect(outcome.calls).toEqual([{ id: 'c1', name: 'lookupLocalDraft', args: { contactName: 'Jane' } }]);
    expect(outcome.continuation.pending).toEqual(outcome.calls);
    expect(outcome.continuation.request).toEqual(['lookupLocalDraft']);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('resume feeds client results back and completes', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'tool-calls',
      text: '',
      toolCalls: [{ toolCallId: 'c1', toolName: 'lookupLocalDraft', input: { contactName: 'Jane' } }],
      response: { messages: [{ role: 'assistant', content: 'asked' }] },
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'stop',
      text: 'Jane Smith jane@local.draft',
      toolCalls: [],
      response: { messages: [] },
      totalUsage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { attendeeName: 'Jane Smith', attendeeEmail: 'jane@local.draft' },
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
    } as any);

    const first = await extract({} as any, 'Schedule with Jane', {
      schema: MeetingSchema,
      registry,
      request: ['lookupLocalDraft'],
    });
    if (first.status !== 'needs_client_tools') throw new Error('expected pause');

    const final = await resume({
      model: {} as any,
      schema: MeetingSchema,
      registry,
      continuation: first.continuation,
      results: [{ id: 'c1', name: 'lookupLocalDraft', result: { email: 'jane@local.draft' } }],
    });

    expect(final.status).toBe('completed');
    if (final.status !== 'completed') throw new Error('unreachable');
    expect(final.data).toEqual({ attendeeName: 'Jane Smith', attendeeEmail: 'jane@local.draft' });
    expect(final.usage).toEqual({ inputTokens: 180, outputTokens: 40, totalTokens: 220 });

    const secondCallArgs = vi.mocked(generateText).mock.calls[1][0] as any;
    const toolMsg = secondCallArgs.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content[0]).toMatchObject({ toolCallId: 'c1', toolName: 'lookupLocalDraft' });
  });

  it('rejects a result whose id matches no pending call', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'tool-calls',
      text: '',
      toolCalls: [{ toolCallId: 'c1', toolName: 'lookupLocalDraft', input: { contactName: 'Jane' } }],
      response: { messages: [{ role: 'assistant', content: 'asked' }] },
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);

    const first = await extract({} as any, 'Schedule with Jane', {
      schema: MeetingSchema,
      registry,
      request: ['lookupLocalDraft'],
    });
    if (first.status !== 'needs_client_tools') throw new Error('expected pause');

    const error = await resume({
      model: {} as any,
      schema: MeetingSchema,
      registry,
      continuation: first.continuation,
      results: [{ id: 'WRONG', name: 'lookupLocalDraft', result: {} }],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ExtractionError);
    expect(error.message).toMatch(/c1|unknown|pending/i);
    expect(generateText).toHaveBeenCalledOnce();
  });

  it('rejects results that leave a pending call unanswered', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'tool-calls',
      text: '',
      toolCalls: [
        { toolCallId: 'c1', toolName: 'lookupLocalDraft', input: { contactName: 'Jane' } },
        { toolCallId: 'c2', toolName: 'lookupLocalDraft', input: { contactName: 'Bob' } },
      ],
      response: { messages: [{ role: 'assistant', content: 'asked' }] },
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);

    const first = await extract({} as any, 'Schedule with Jane and Bob', {
      schema: MeetingSchema,
      registry,
      request: ['lookupLocalDraft'],
    });
    if (first.status !== 'needs_client_tools') throw new Error('expected pause');

    const error = await resume({
      model: {} as any,
      schema: MeetingSchema,
      registry,
      continuation: first.continuation,
      results: [{ id: 'c1', name: 'lookupLocalDraft', result: {} }],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ExtractionError);
    expect(error.message).toMatch(/c2|missing|unanswered/i);
  });

  it('resumes from a continuation that survived JSON serialization', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'tool-calls',
      text: '',
      toolCalls: [{ toolCallId: 'c1', toolName: 'lookupLocalDraft', input: { contactName: 'Jane' } }],
      response: { messages: [{ role: 'assistant', content: 'asked' }] },
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    } as any);
    vi.mocked(generateText).mockResolvedValueOnce({
      finishReason: 'stop',
      text: 'done',
      toolCalls: [],
      response: { messages: [] },
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { attendeeName: 'Jane', attendeeEmail: 'jane@local.draft' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const first = await extract({} as any, 'Schedule with Jane', {
      schema: MeetingSchema,
      registry,
      request: ['lookupLocalDraft'],
    });
    if (first.status !== 'needs_client_tools') throw new Error('expected pause');

    const roundTripped = JSON.parse(JSON.stringify(first.continuation));

    const final = await resume({
      model: {} as any,
      schema: MeetingSchema,
      registry,
      continuation: roundTripped,
      results: [{ id: 'c1', name: 'lookupLocalDraft', result: { email: 'jane@local.draft' } }],
    });

    expect(final.status).toBe('completed');
  });
});
