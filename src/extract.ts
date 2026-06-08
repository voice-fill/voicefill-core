import { generateObject, generateText, tool, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import type { z } from 'zod';
import type {
  ExtractOptions, ExtractOutcome, TokenUsage, RegistryTool, ToolRegistry,
  ClientToolCall, ClientToolResult, ExtractionContinuation, ResumeOptions,
} from './types.js';
import { ExtractionError } from './errors.js';

const DEFAULT_PROMPT = 'Extract structured data from the following text.';

function withContext(text: string, context?: string | Record<string, unknown>): string {
  if (context == null) return text;
  const block = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
  return `${text}\n\nKnown context from the user's device:\n${block}`;
}

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

function buildTools(tools: RegistryTool[]) {
  const result: Record<string, unknown> = {};
  for (const t of tools) {
    const def: Record<string, unknown> = { description: t.description, inputSchema: t.parameters };
    // Client tools are registered WITHOUT execute so the SDK stops and returns the call.
    if (t.runsOn === 'server' && t.execute) def.execute = t.execute;
    result[t.name] = tool(def as Parameters<typeof tool>[0]);
  }
  return result as Parameters<typeof generateText>[0]['tools'];
}

/** Shared state for one turn of the gather loop. */
interface GatherState {
  model: LanguageModel;
  schema: z.ZodType;
  systemPrompt: string;
  registry: ToolRegistry;
  request?: string[];
  allow?: string[];
  maxSteps: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  messages: ModelMessage[];
  usageSoFar: TokenUsage;
}

const FINALIZE_INSTRUCTION =
  'Using the transcript and every tool result above, extract the structured data. ' +
  'Copy exact values (emails, phone numbers, ids) from tool results verbatim.';

async function finalize(
  state: GatherState,
  conversation: ModelMessage[],
  usage: TokenUsage,
): Promise<ExtractOutcome<unknown>> {
  const { object, usage: objectUsage } = await generateObject({
    model: state.model,
    schema: state.schema as z.ZodType<Record<string, unknown>>,
    system: state.systemPrompt,
    messages: [...conversation, { role: 'user', content: FINALIZE_INSTRUCTION }],
    ...(state.maxRetries !== undefined && { maxRetries: state.maxRetries }),
    ...(state.abortSignal && { abortSignal: state.abortSignal }),
  });

  return {
    status: 'completed',
    data: object,
    usage: addUsage(usage, {
      inputTokens: objectUsage.inputTokens,
      outputTokens: objectUsage.outputTokens,
      totalTokens: objectUsage.totalTokens,
    }),
  };
}

async function runGather(state: GatherState): Promise<ExtractOutcome<unknown>> {
  const selected = state.registry.select({ request: state.request, allow: state.allow });

  const result = await generateText({
    model: state.model,
    tools: buildTools(selected),
    stopWhen: stepCountIs(state.maxSteps),
    system: `${state.systemPrompt}\n\nUse the available tools to gather any information you need, then summarize everything you found.`,
    messages: state.messages,
    ...(state.maxRetries !== undefined && { maxRetries: state.maxRetries }),
    ...(state.abortSignal && { abortSignal: state.abortSignal }),
  });

  const usage = addUsage(state.usageSoFar, {
    inputTokens: result.totalUsage.inputTokens,
    outputTokens: result.totalUsage.outputTokens,
    totalTokens: result.totalUsage.totalTokens,
  });

  const clientCalls: ClientToolCall[] = (result.toolCalls ?? [])
    .filter((tc) => state.registry.get(tc.toolName)?.runsOn === 'client')
    .map((tc) => ({ id: tc.toolCallId, name: tc.toolName, args: tc.input }));

  if (result.finishReason === 'tool-calls' && clientCalls.length > 0) {
    const continuation: ExtractionContinuation = {
      messages: [...state.messages, ...(result.response.messages as ModelMessage[])],
      usageSoFar: usage,
      pending: clientCalls,
      request: state.request,
      allow: state.allow,
    };
    return { status: 'needs_client_tools', calls: clientCalls, continuation };
  }

  const conversation: ModelMessage[] = [
    ...state.messages,
    ...(result.response.messages as ModelMessage[]),
  ];
  return finalize(state, conversation, usage);
}

/**
 * Extract structured data from text. With no `registry`, this is a single `generateObject`
 * call. With a `registry`, the model may call tools: server tools run inline; if the model
 * calls a client tool, this returns `needs_client_tools` with a serializable `continuation`
 * the caller passes to {@link resume} once the device has run its handlers. The library holds
 * no state.
 */
export async function extract<T extends z.ZodType>(
  model: LanguageModel,
  text: string,
  options: ExtractOptions<T>,
): Promise<ExtractOutcome<z.infer<T>>> {
  const { schema, prompt, context, registry, request, allow, maxSteps = 5, maxRetries, abortSignal } = options;
  const systemPrompt = prompt ?? DEFAULT_PROMPT;
  const input = withContext(text, context);

  try {
    const selected = registry ? registry.select({ request, allow }) : [];

    if (selected.length === 0) {
      const { object, usage } = await generateObject({
        model,
        schema,
        system: systemPrompt,
        prompt: input,
        ...(maxRetries !== undefined && { maxRetries }),
        ...(abortSignal && { abortSignal }),
      });
      return {
        status: 'completed',
        data: object,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      };
    }

    return (await runGather({
      model,
      schema,
      systemPrompt,
      registry: registry!,
      request,
      allow,
      maxSteps,
      maxRetries,
      abortSignal,
      messages: [{ role: 'user', content: input }],
      usageSoFar: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })) as ExtractOutcome<z.infer<T>>;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Resume a paused extraction with client tool results, continuing until completion or the
 * next pause. The `model`, `schema`, and `registry` are re-supplied by the caller; the
 * `continuation` carries only serializable conversation state.
 */
export async function resume<T extends z.ZodType>(
  options: ResumeOptions<T>,
): Promise<ExtractOutcome<z.infer<T>>> {
  const {
    model, schema, registry, continuation, results,
    prompt, maxSteps = 5, maxRetries, abortSignal,
  } = options;

  const pendingIds = new Set(continuation.pending.map((c) => c.id));
  const resultIds = new Set(results.map((r) => r.id));
  for (const r of results) {
    if (!pendingIds.has(r.id)) {
      throw new ExtractionError(`Resume received a result for an unknown tool-call id "${r.id}".`);
    }
  }
  for (const c of continuation.pending) {
    if (!resultIds.has(c.id)) {
      throw new ExtractionError(`Resume is missing a result for pending tool-call id "${c.id}".`);
    }
  }

  const toolMessages: ModelMessage[] = results.map((r: ClientToolResult) => ({
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: r.id,
        toolName: r.name,
        output: { type: 'json', value: r.result as never },
      },
    ],
  }));

  try {
    return (await runGather({
      model,
      schema,
      systemPrompt: prompt ?? DEFAULT_PROMPT,
      registry,
      request: continuation.request,
      allow: continuation.allow,
      maxSteps,
      maxRetries,
      abortSignal,
      messages: [...continuation.messages, ...toolMessages],
      usageSoFar: continuation.usageSoFar,
    })) as ExtractOutcome<z.infer<T>>;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(
      `Resume failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}
