import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Harbor } from 'harbord';
import { resolve, join } from 'path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('IDE Plugin Example', () => {
  let harbor: Harbor;
  let baseDir: string;
  const serverPath = resolve(__dirname, '../src/server.cjs');

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-ide-test-'));
    harbor = new Harbor({ home: baseDir });
  });

  afterAll(async () => {
    try {
      await harbor.daemon.stop();
    } catch (e) {
      // Ignore if already stopped
    }
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should share a single language server between multiple client instances', async () => {
    console.log('[Test] Starting Client 1...');
    const ls1 = await harbor.service('language-server', {
      entry: serverPath,
      singleton: true
    });
    
    if (ls1.state?.status !== 'running') {
      console.error('[Test] Client 1 failed to start:', ls1.state?.metadata?.error);
    }
    expect(ls1.state?.status).toBe('running');

    console.log('[Test] Starting Client 2...');
    const ls2 = await harbor.service('language-server', {
      entry: serverPath,
      singleton: true
    });
    
    expect(ls2.pid).toBe(ls1.pid);

    console.log('[Test] Waiting for metadata...');
    let meta: any = null;
    for (let i = 0; i < 20; i++) {
      await ls2.refresh();
      if (ls2.state?.metadata?.port) {
        meta = ls2.state.metadata;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    expect(meta).toBeDefined();
    expect(meta.port).toBeGreaterThan(0);
    expect(meta.capabilities).toContain('completion');
    console.log('[Test] Success! Port:', meta.port);
  }, 40000);
});
