import { Harbor } from 'harbord';
import { resolve } from 'path';

async function clientTask(clientId: string) {
  console.log(`[Client ${clientId}] Starting...`);
  const harbor = new Harbor();
  const workerPath = resolve(__dirname, 'worker.cjs');

  // Try to manage a service
  const serviceId = `shared-worker-${clientId}`;
  console.log(`[Client ${clientId}] Ensuring service ${serviceId}...`);
  
  const svc = await harbor.service(serviceId, {
    entry: workerPath,
    args: [serviceId]
  });

  console.log(`[Client ${clientId}] Service ${serviceId} is ${svc.state?.status}`);
  
  // Keep alive for a bit to simulate work
  await new Promise(r => setTimeout(r, 2000));
  
  console.log(`[Client ${clientId}] Task complete.`);
  await harbor.disconnect();
}

const clientId = process.argv[2] || 'unknown';
clientTask(clientId).then(() => {
  process.exit(0);
}).catch(err => {
  console.error(`[Client ${clientId}] Failed:`, err);
  process.exit(1);
});
