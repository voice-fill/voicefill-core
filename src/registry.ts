import type { RegistryTool, ToolRegistry } from './types.js';

/**
 * Create the server-side tool registry — the single source of truth for which tools
 * the model may call. Client requests reference tools by name only; unknown or
 * disallowed names are dropped (fail closed), so a client can never add or alter a tool.
 */
export function createToolRegistry(tools: RegistryTool[]): ToolRegistry {
  const byName = new Map<string, RegistryTool>();

  for (const t of tools) {
    if (byName.has(t.name)) {
      throw new Error(`Duplicate tool name in registry: "${t.name}"`);
    }
    if (t.runsOn === 'server' && !t.execute) {
      throw new Error(`Server tool "${t.name}" must define an execute function.`);
    }
    if (t.runsOn === 'client' && t.execute) {
      throw new Error(`Client tool "${t.name}" must not define execute — it runs on the device.`);
    }
    byName.set(t.name, t);
  }

  const all = (): RegistryTool[] => [...byName.values()];

  return {
    list: all,
    get: (name) => byName.get(name),
    select: (opts) => {
      const { allow, request } = opts ?? {};
      return all().filter((t) => {
        if (allow && !allow.includes(t.name)) return false;
        if (request && !request.includes(t.name)) return false;
        return true;
      });
    },
  };
}
