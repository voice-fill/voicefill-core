import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from 'ai';
import { extract } from '../src/extract.js';

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
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
        schema: ContactSchema,
        prompt: 'My name is John Doe, email john@example.com',
      }),
    );
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
});
