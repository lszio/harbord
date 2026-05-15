import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Harbor } from 'harbord';
import { resolve, join } from 'path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('MCP Servers Example', () => {
  let harbor: Harbor;
  let baseDir: string;
  const serverPath = resolve(__dirname, '../src/server.cjs');

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-mcp-test-'));
    harbor = new Harbor({ home: baseDir });
  });

  afterAll(async () => {
    try {
      await harbor.daemon.stop();
    } catch (e) {}
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should manage multiple dynamic MCP servers', async () => {
    const names = ['sqlite', 'weather'];

    for (const name of names) {
      const svc = await harbor.service(`${name}-mcp`, {
        entry: serverPath,
        args: [name]
      });
      expect(svc.state?.status).toBe('running');
    }

    // Verify both are running and have distinct metadata
    for (const name of names) {
      const svc = await harbor.service(`${name}-mcp`);
      
      let meta: any = null;
      for (let i = 0; i < 20; i++) {
        await svc.refresh();
        if (svc.state?.metadata?.name === name) {
          meta = svc.state.metadata;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      
      expect(meta).toBeDefined();
      expect(meta.name).toBe(name);
      expect(meta.port).toBeGreaterThan(0);
    }
  }, 40000);
});
