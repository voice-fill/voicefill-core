import { generateObject, generateText, tool, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { ExtractOptions, ExtractResult, TokenUsage, VoiceFillTool } from './types.js';
import { ExtractionError } from './errors.js';

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens != null && b.inputTokens != null
      ? a.inputTokens + b.inputTokens : undefined,
    outputTokens: a.outputTokens != null && b.outputTokens != null
      ? a.outputTokens + b.outputTokens : undefined,
    totalTokens: a.totalTokens != null && b.totalTokens != null
      ? a.totalTokens + b.totalTokens : undefined,
  };
}

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
  maxRetries?: number,
  abortSignal?: AbortSignal,
): Promise<{ text: string; usage: TokenUsage }> {
  const { text: gathered, totalUsage } = await generateText({
    model,
    tools: buildToolsObject(tools),
    stopWhen: stepCountIs(maxSteps),
    system: `${systemPrompt}\n\nUse the available tools to gather any information you need, then provide a comprehensive summary of everything you found.`,
    prompt: text,
    ...(maxRetries !== undefined && { maxRetries }),
    ...(abortSignal && { abortSignal }),
  });

  return {
    text: gathered,
    usage: {
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      totalTokens: totalUsage.totalTokens,
    },
  };
}

export async function extract<T extends z.ZodType>(
  model: LanguageModel,
  text: string,
  options: ExtractOptions<T>,
): Promise<ExtractResult<z.infer<T>>> {
  const { schema, prompt, tools, maxSteps = 5, maxRetries, abortSignal } = options;
  const systemPrompt = prompt ?? 'Extract structured data from the following text.';

  try {
    if (tools && tools.length > 0) {
      const gathered = await gatherWithTools(
        model, text, tools, maxSteps, systemPrompt, maxRetries, abortSignal,
      );

      const { object, usage: objectUsage } = await generateObject({
        model,
        schema,
        system: systemPrompt,
        prompt: `Original input:\n${text}\n\nAdditional context from tools:\n${gathered.text}`,
        ...(maxRetries !== undefined && { maxRetries }),
        ...(abortSignal && { abortSignal }),
      });

      return {
        data: object,
        usage: addUsage(gathered.usage, {
          inputTokens: objectUsage.inputTokens,
          outputTokens: objectUsage.outputTokens,
          totalTokens: objectUsage.totalTokens,
        }),
      };
    }

    const { object, usage } = await generateObject({
      model,
      schema,
      system: systemPrompt,
      prompt: text,
      ...(maxRetries !== undefined && { maxRetries }),
      ...(abortSignal && { abortSignal }),
    });

    return {
      data: object,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
