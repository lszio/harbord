import { Harbor } from 'harbord';
import { resolve } from 'path';

async function runDashboard() {
  const harbor = new Harbor();
  const workerPath = resolve(__dirname, 'worker.cjs');

  try {
    console.log('Starting workers...');
    await harbor.service('worker-a', { entry: workerPath, args: ['worker-a'] });
    await harbor.service('worker-b', { entry: workerPath, args: ['worker-b'] });

    console.log('Monitoring services (5 seconds)...');
    for (let i = 0; i < 5; i++) {
      const statusA = await harbor.service('worker-a');
      const statusB = await harbor.service('worker-b');
      
      console.log(`[${new Date().toLocaleTimeString()}]`);
      console.log(`  worker-a: ${statusA.state?.status}`);
      console.log(`  worker-b: ${statusB.state?.status}`);
      
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('Shutting down worker-a...');
    const svcA = await harbor.service('worker-a');
    await svcA.down();

    await new Promise(r => setTimeout(r, 1000));
    const finalA = await harbor.service('worker-a');
    console.log(`worker-a final status: ${finalA.state?.status}`);
  } finally {
    console.log('Cleaning up...');
    await harbor.daemon.stop().catch(() => {});
    process.exit(0);
  }
}

runDashboard().catch(err => {
  console.error('Dashboard Error:', err);
  process.exit(1);
});
