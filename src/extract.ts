import { generateObject, generateText, tool, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { ExtractOptions, VoiceFillTool } from './types.js';
import { ExtractionError } from './errors.js';

function buildToolsObject(tools: VoiceFillTool[]) {
  const result: Record<string, unknown> = {};
  for (const t of tools) {
    result[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: t.execute,
    });
  }
  return result as Parameters<typeof generateText>[0]['tools'];
}

async function gatherWithTools(
  model: LanguageModel,
  text: string,
  tools: VoiceFillTool[],
  maxSteps: number,
  systemPrompt: string,
): Promise<string> {
  const { text: gathered } = await generateText({
    model,
    tools: buildToolsObject(tools),
    stopWhen: stepCountIs(maxSteps),
    system: `${systemPrompt}\n\nUse the available tools to gather any information you need, then provide a comprehensive summary of everything you found.`,
    prompt: text,
  });

  return gathered;
}

export async function extract<T extends z.ZodType>(
  model: LanguageModel,
  text: string,
  options: ExtractOptions<T>,
): Promise<z.infer<T>> {
  const { schema, prompt, tools, maxSteps = 5 } = options;
  const systemPrompt = prompt ?? 'Extract structured data from the following text.';

  try {
    if (tools && tools.length > 0) {
      const gathered = await gatherWithTools(model, text, tools, maxSteps, systemPrompt);

      const { object } = await generateObject({
        model,
        schema,
        system: systemPrompt,
        prompt: `Original input:\n${text}\n\nAdditional context from tools:\n${gathered}`,
      });

      return object;
    }

    const { object } = await generateObject({
      model,
      schema,
      system: systemPrompt,
      prompt: text,
    });

    return object;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
