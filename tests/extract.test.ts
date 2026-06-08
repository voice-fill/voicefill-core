import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  tool: vi.fn((def: any) => def),
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));

import { generateObject, generateText } from 'ai';
import { extract } from '../src/extract.js';
import { createToolRegistry } from '../src/registry.js';
import { ExtractionError } from '../src/errors.js';

const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});

describe('extract — pure extraction (no tools)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a completed outcome from generateObject, without calling generateText', async () => {
    const expected = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
    vi.mocked(generateObject).mockResolvedValue({
      object: expected,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const outcome = await extract({} as any, 'My name is John Doe, email john@example.com', {
      schema: ContactSchema,
    });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') throw new Error('unreachable');
    expect(outcome.data).toEqual(expected);
    expect(outcome.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(generateObject).toHaveBeenCalledOnce();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('uses custom system prompt when provided', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Smith', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'I am Jane Smith', {
      schema: ContactSchema,
      prompt: 'Extract only name fields.',
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'Extract only name fields.' }),
    );
  });

  it('wraps errors in ExtractionError', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('model overloaded'));

    const error = await extract({} as any, 'text', { schema: ContactSchema }).catch((e) => e);

    expect(error).toBeInstanceOf(ExtractionError);
    expect(error.message).toContain('model overloaded');
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('folds provided context into the generateObject prompt', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@saved.com' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'My name is John', {
      schema: ContactSchema,
      context: { savedEmail: 'john@saved.com' },
    });

    const call = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(call.prompt).toContain('My name is John');
    expect(call.prompt).toContain('john@saved.com');
  });

  it('accepts a plain string as context', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'transcript', { schema: ContactSchema, context: 'User works at ACME Corp.' });

    const call = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(call.prompt).toContain('User works at ACME Corp.');
  });

  it('passes maxRetries and abortSignal through to generateObject', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const controller = new AbortController();
    await extract({} as any, 'text', {
      schema: ContactSchema,
      maxRetries: 0,
      abortSignal: controller.signal,
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, abortSignal: controller.signal }),
    );
  });
});

describe('extract — server tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const registry = createToolRegistry([
    {
      name: 'searchContacts',
      description: 'Search contacts by name',
      parameters: z.object({ query: z.string() }),
      runsOn: 'server',
      execute: async () => [{ name: 'John Doe', email: 'john@acme.com' }],
    },
  ]);

  it('gathers with generateText then produces structured output with generateObject', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'stop',
      text: 'The contact is John Doe, email john@acme.com.',
      toolCalls: [],
      response: { messages: [] },
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@acme.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const outcome = await extract({} as any, 'Find John from Acme', {
      schema: ContactSchema,
      registry,
      request: ['searchContacts'],
    });

    expect(generateText).toHaveBeenCalledOnce();
    expect(generateObject).toHaveBeenCalledOnce();
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') throw new Error('unreachable');
    expect(outcome.data).toEqual({ firstName: 'John', lastName: 'Doe', email: 'john@acme.com' });
    expect(outcome.usage).toEqual({ inputTokens: 300, outputTokens: 130, totalTokens: 430 });
  });

  it('passes the selected server tool (with execute) to generateText', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'stop',
      text: 'done',
      toolCalls: [],
      response: { messages: [] },
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'text', { schema: ContactSchema, registry, request: ['searchContacts'] });

    const call = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(call.tools.searchContacts).toBeDefined();
    expect(call.tools.searchContacts.execute).toBeTypeOf('function');
    expect(call.stopWhen).toBe('stepCountIs(5)');
  });

  it('folds context into the gather messages when tools are used', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'stop',
      text: 'done',
      toolCalls: [],
      response: { messages: [] },
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'Find John', {
      schema: ContactSchema,
      registry,
      request: ['searchContacts'],
      context: { company: 'ACME Corp' },
    });

    const call = vi.mocked(generateText).mock.calls[0][0] as any;
    const userMsg = call.messages.find((m: any) => m.role === 'user');
    expect(JSON.stringify(userMsg.content)).toContain('ACME Corp');
  });

  it('passes the full conversation — including the transcript — to the structuring call', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'stop',
      text: 'summary',
      toolCalls: [],
      response: { messages: [{ role: 'assistant', content: 'The contact works at Acme.' }] },
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@acme.com' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'My name is John Doe, email john@acme.com', {
      schema: ContactSchema,
      registry,
      request: ['searchContacts'],
    });

    const objCall = vi.mocked(generateObject).mock.calls[0][0] as any;
    const serialized = JSON.stringify(objCall.messages);
    expect(serialized).toContain('My name is John Doe, email john@acme.com');
    expect(serialized).toContain('The contact works at Acme.');
  });

  it('hands verbatim tool outputs to the structuring call, not just the model summary', async () => {
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'stop',
      text: 'Found the contact.', // summary deliberately omits the phone number
      toolCalls: [],
      response: {
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'searchContacts', input: { query: 'John' } }],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 't1',
                toolName: 'searchContacts',
                output: { type: 'json', value: { phone: '555-0188' } },
              },
            ],
          },
          { role: 'assistant', content: 'Found the contact.' },
        ],
      },
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@acme.com' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'Find John from Acme', {
      schema: ContactSchema,
      registry,
      request: ['searchContacts'],
    });

    const objCall = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(JSON.stringify(objCall.messages)).toContain('555-0188');
  });

  it('falls back to pure extraction when the client requests no valid tools', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'text', { schema: ContactSchema, registry, request: ['nope'] });

    expect(generateText).not.toHaveBeenCalled();
    expect(generateObject).toHaveBeenCalledOnce();
  });
});
