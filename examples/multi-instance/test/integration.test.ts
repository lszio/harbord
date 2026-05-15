import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Harbor } from 'harbord';
import { resolve, join } from 'path';
import { spawn } from 'child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('Multi-Instance Example', () => {
  let baseDir: string;

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-multi-test-'));
  });

  afterAll(async () => {
    const harbor = new Harbor({ home: baseDir });
    try {
      await harbor.daemon.stop();
    } catch (e) {}
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should handle multiple concurrent bootstrap requests', async () => {
    const clients = ['X', 'Y'];
    const clientScript = resolve(__dirname, '../src/client.ts');

    const processes = clients.map(id => {
      return spawn('bun', ['run', clientScript, id], { 
        stdio: 'pipe',
        env: { ...process.env, HARBORD_HOME: baseDir }
      });
    });

    const exits = await Promise.all(processes.map(p => new Promise(resolve => p.on('exit', (code) => resolve(code)))));
    
    for (const code of exits) {
      expect(code).toBe(0);
    }

    const harbor = new Harbor({ home: baseDir });
    const status = await harbor.daemon.status();
    expect(status.pid).toBeGreaterThan(0);
  }, 40000);
});
