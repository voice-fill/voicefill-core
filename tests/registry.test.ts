import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createToolRegistry } from '../src/registry.js';
import type { RegistryTool } from '../src/types.js';

const serverTool: RegistryTool = {
  name: 'searchContacts',
  description: 'Search contacts',
  parameters: z.object({ q: z.string() }),
  runsOn: 'server',
  execute: async () => [],
};

const clientTool: RegistryTool = {
  name: 'lookupLocalDraft',
  description: 'Read a local draft',
  parameters: z.object({ contactName: z.string() }),
  runsOn: 'client',
};

describe('createToolRegistry', () => {
  it('throws when a server tool has no execute', () => {
    expect(() =>
      createToolRegistry([{ ...serverTool, execute: undefined }]),
    ).toThrow(/searchContacts.*execute/i);
  });

  it('throws when a client tool defines execute', () => {
    expect(() =>
      createToolRegistry([{ ...clientTool, execute: async () => null }]),
    ).toThrow(/lookupLocalDraft.*execute/i);
  });

  it('throws on duplicate tool names', () => {
    expect(() => createToolRegistry([serverTool, serverTool])).toThrow(/duplicate/i);
  });

  it('rejects a client tool whose name collides with a server tool', () => {
    const shadow: RegistryTool = { ...clientTool, name: 'searchContacts' };
    expect(() => createToolRegistry([serverTool, shadow])).toThrow(/duplicate.*searchContacts/i);
  });

  it('list() returns all registered tools', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    expect(reg.list().map((t) => t.name)).toEqual(['searchContacts', 'lookupLocalDraft']);
  });

  it('get() resolves a tool by name', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    expect(reg.get('lookupLocalDraft')?.runsOn).toBe('client');
    expect(reg.get('nope')).toBeUndefined();
  });

  it('select() with no options returns the full registry', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    expect(reg.select().map((t) => t.name)).toEqual(['searchContacts', 'lookupLocalDraft']);
  });

  it('select() drops requested names not in the registry (fail closed)', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    const picked = reg.select({ request: ['searchContacts', 'evilExfiltrate'] });
    expect(picked.map((t) => t.name)).toEqual(['searchContacts']);
  });

  it('select() honors the server allowlist', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    const picked = reg.select({ allow: ['lookupLocalDraft'] });
    expect(picked.map((t) => t.name)).toEqual(['lookupLocalDraft']);
  });

  it('select() intersects request and allow', () => {
    const reg = createToolRegistry([serverTool, clientTool]);
    const picked = reg.select({ request: ['searchContacts', 'lookupLocalDraft'], allow: ['searchContacts'] });
    expect(picked.map((t) => t.name)).toEqual(['searchContacts']);
  });
});
