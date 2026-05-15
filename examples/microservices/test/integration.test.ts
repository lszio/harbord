import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Harbor } from 'harbord';
import { resolve, join } from 'path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('Microservices Example', () => {
  let harbor: Harbor;
  let baseDir: string;
  const workerPath = resolve(__dirname, '../src/worker.cjs');

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-ms-test-'));
    harbor = new Harbor({ home: baseDir });
  });

  afterAll(async () => {
    try {
      await harbor.daemon.stop();
    } catch (e) {}
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should manage multiple workers and handle heartbeats', async () => {
    await harbor.service('worker-a', { entry: workerPath, args: ['worker-a'] });
    await harbor.service('worker-b', { entry: workerPath, args: ['worker-b'] });

    const svcA = await harbor.service('worker-a');
    const svcB = await harbor.service('worker-b');

    expect(svcA.state?.status).toBe('running');
    expect(svcB.state?.status).toBe('running');

    await svcA.down();
    expect(svcA.state?.status).toBe('stopped');
    
    await svcB.refresh();
    expect(svcB.state?.status).toBe('running');
  }, 40000);
});
