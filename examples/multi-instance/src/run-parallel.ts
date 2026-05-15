import { Harbor } from 'harbord';
import { resolve } from 'path';
import { spawn } from 'child_process';

async function runParallel() {
  console.log('--- Parallel Multi-Instance Bootstrap Test ---');
  console.log('Launching 3 clients simultaneously to compete for the bootstrap lock...\n');

  const clients = ['A', 'B', 'C'];
  const clientScript = resolve(__dirname, 'client.ts');

  const processes = clients.map(id => {
    return spawn('bun', ['run', clientScript, id], { stdio: 'inherit' });
  });

  await Promise.all(processes.map(p => new Promise(resolve => p.on('exit', resolve))));

  console.log('\n--- All clients finished ---');
  
  const harbor = new Harbor();
  await harbor.daemon.stop();
  process.exit(0);
}

runParallel().catch(err => {
  console.error(err);
  process.exit(1);
});
