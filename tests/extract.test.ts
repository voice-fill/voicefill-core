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
    vi.mocked(generateObject).mockResolvedValue({ object: expected } as any);

    const mockModel = {} as any;
    const result = await extract(mockModel, 'My name is John Doe, email john@example.com', {
      schema: ContactSchema,
    });

    expect(result).toEqual(expected);
    expect(generateObject).toHaveBeenCalledOnce();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('uses custom system prompt when provided', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Smith', email: '' },
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
});

describe('extract with tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs generateText with tools first, then generateObject for structured output', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'The contact is John Doe, email john@acme.com. Found via search.',
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'John', lastName: 'Doe', email: 'john@acme.com' },
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
    expect(result).toEqual({ firstName: 'John', lastName: 'Doe', email: 'john@acme.com' });
  });

  it('passes tools as object keyed by name to generateText', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: 'info gathered' } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
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
    } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com' },
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
    vi.mocked(generateText).mockResolvedValue({ text: 'done' } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
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
    vi.mocked(generateText).mockResolvedValue({ text: 'done' } as any);
    vi.mocked(generateObject).mockResolvedValue({
      object: { firstName: '', lastName: '', email: '' },
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
});
