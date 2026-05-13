import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { ExtractOptions } from './types.js';
import { ExtractionError } from './errors.js';

export async function extract<T extends z.ZodType>(
  model: LanguageModel,
  text: string,
  options: ExtractOptions<T>,
): Promise<z.infer<T>> {
  const { schema, prompt } = options;

  try {
    const { object } = await generateObject({
      model,
      schema,
      system: prompt ?? 'Extract structured data from the following text.',
      prompt: text,
    });

    return object;
  } catch (error) {
    throw new ExtractionError(
      `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
