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
import { ExtractionError } from '../src/errors.js';

const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});

describe('extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateObject with model, schema, and transcript as prompt', async () => {
    const expected = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
    vi.mocked(generateObject).mockResolvedValue({
      object: expected,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const mockModel = {} as any;
    const result = await extract(mockModel, 'My name is John Doe, email john@example.com', {
      schema: ContactSchema,
    });

    expect(result.data).toEqual(expected);
    expect(generateObject).toHaveBeenCalledOnce();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('uses custom system prompt when provided', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Smith', email: '' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    await extract({} as any, 'I am Jane Smith', {
      schema: ContactSchema,
      prompt: 'Extract only name fields.',
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Extract only name fields.',
      }),
    );
  });

  it('wraps errors in ExtractionError', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('model overloaded'));

    const error = await extract({} as any, 'text', { schema: ContactSchema }).catch((e) => e);

    expect(error).toBeInstanceOf(ExtractionError);
    expect(error.message).toContain('model overloaded');
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('returns token usage from generateObject', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
      usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110 },
    } as any);

    const result = await extract({} as any, 'I am Jane Doe', { schema: ContactSchema });

    expect(result.usage).toEqual({ inputTokens: 80, outputTokens: 30, totalTokens: 110 });
  });

  it('passes maxRetries through to generateObject', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    await extract({} as any, 'text', { schema: ContactSchema, maxRetries: 0 });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it('passes abortSignal through to generateObject', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const controller = new AbortController();
    await extract({} as any, 'text', { schema: ContactSchema, abortSignal: controller.signal });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });
});

describe('extract with tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs generateText with tools first, then generateObject for structured output', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'The contact is John Doe, email john@acme.com. Found via search.',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@acme.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const searchTool = {
      name: 'searchContacts',
      description: 'Search contacts by name',
      parameters: z.object({ query: z.string() }),
      execute: vi.fn().mockResolvedValue([{ name: 'John Doe', email: 'john@acme.com' }]),
    };

    const result = await extract({} as any, 'Find John from Acme', {
      schema: ContactSchema,
      tools: [searchTool],
    });

    expect(generateText).toHaveBeenCalledOnce();
    expect(generateObject).toHaveBeenCalledOnce();
    expect(result.data).toEqual({ firstName: 'John', lastName: 'Doe', email: 'john@acme.com' });
  });

  it('passes tools as object keyed by name to generateText', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'info gathered',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const tool1 = {
      name: 'lookup',
      description: 'Look up data',
      parameters: z.object({ id: z.string() }),
      execute: vi.fn(),
    };

    await extract({} as any, 'some text', {
      schema: ContactSchema,
      tools: [tool1],
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          lookup: expect.objectContaining({
            description: 'Look up data',
          }),
        }),
      }),
    );
  });

  it('feeds generateText output into generateObject as context', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'Gathered info: Jane Smith, jane@test.com',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    await extract({} as any, 'Find Jane', {
      schema: ContactSchema,
      tools: [
        {
          name: 'search',
          description: 'Search',
          parameters: z.object({ q: z.string() }),
          execute: vi.fn(),
        },
      ],
    });

    const generateObjectCall = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(generateObjectCall.prompt).toContain('Find Jane');
    expect(generateObjectCall.prompt).toContain('Gathered info: Jane Smith, jane@test.com');
  });

  it('uses default maxSteps of 5', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'done',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    await extract({} as any, 'text', {
      schema: ContactSchema,
      tools: [
        {
          name: 't',
          description: 'd',
          parameters: z.object({}),
          execute: vi.fn(),
        },
      ],
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: 'stepCountIs(5)',
      }),
    );
  });

  it('respects custom maxSteps', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'done',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    await extract({} as any, 'text', {
      schema: ContactSchema,
      maxSteps: 10,
      tools: [
        {
          name: 't',
          description: 'd',
          parameters: z.object({}),
          execute: vi.fn(),
        },
      ],
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: 'stepCountIs(10)',
      }),
    );
  });

  it('combines token usage from generateText and generateObject when tools are used', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'gathered data',
      totalUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'A', lastName: 'B', email: 'a@b.com' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);

    const result = await extract({} as any, 'text', {
      schema: ContactSchema,
      tools: [{
        name: 't', description: 'd',
        parameters: z.object({}), execute: vi.fn(),
      }],
    });

    expect(result.usage).toEqual({
      inputTokens: 300,
      outputTokens: 130,
      totalTokens: 430,
    });
  });

  it('handles undefined token counts when combining usage', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'gathered',
      totalUsage: { inputTokens: undefined, outputTokens: 80, totalTokens: undefined },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'A', lastName: 'B', email: 'c@d.com' },
      usage: { inputTokens: 100, outputTokens: undefined, totalTokens: undefined },
    } as any);

    const result = await extract({} as any, 'text', {
      schema: ContactSchema,
      tools: [{
        name: 't', description: 'd',
        parameters: z.object({}), execute: vi.fn(),
      }],
    });

    expect(result.usage).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('passes maxRetries and abortSignal to generateText when tools are used', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'done',
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as any);

    const controller = new AbortController();
    await extract({} as any, 'text', {
      schema: ContactSchema,
      maxRetries: 3,
      abortSignal: controller.signal,
      tools: [{
        name: 't', description: 'd',
        parameters: z.object({}), execute: vi.fn(),
      }],
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 3, abortSignal: controller.signal }),
    );
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 3, abortSignal: controller.signal }),
    );
  });
});
