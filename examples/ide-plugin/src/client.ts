import { Harbor } from 'harbord';
import { resolve } from 'path';

async function runIDEPlugin() {
  const harbor = new Harbor();
  const serverPath = resolve(__dirname, 'server.cjs');

  try {
    console.log('IDE Plugin 1: Attaching to Language Server...');
    const ls1 = await harbor.service('language-server', {
      entry: serverPath,
      singleton: true
    });

    console.log(`IDE Plugin 1: Status is ${ls1.state?.status}`);

    // Simulate another IDE instance
    console.log('IDE Plugin 2: Attaching to Language Server...');
    const ls2 = await harbor.service('language-server', {
      entry: serverPath,
      singleton: true
    });

    // Wait for metadata to be available with timeout
    console.log('Waiting for metadata...');
    let meta = ls2.state?.metadata;
    let retries = 0;
    const maxRetries = 20;

    while ((!meta || !meta.port) && retries < maxRetries) {
      await new Promise(r => setTimeout(r, 500));
      await ls2.refresh();
      meta = ls2.state?.metadata;
      retries++;
      if (retries % 5 === 0) console.log(`  Still waiting (${retries}/${maxRetries})...`);
    }

    if (meta && meta.port) {
      console.log(`IDE Plugin 2: Connected to server on port ${meta.port}`);
      console.log(`Capabilities: ${JSON.stringify(meta.capabilities)}`);
      console.log(`Same PID? ${ls1.pid === ls2.pid} (PID: ${ls1.pid})`);
    } else {
      console.error('Timed out waiting for metadata.');
    }
  } finally {
    console.log('Cleaning up...');
    await harbor.daemon.stop().catch(() => {});
    console.log('IDE Plugin: Finished.');
    process.exit(0);
  }
}

runIDEPlugin().catch(err => {
  console.error('IDE Plugin Error:', err);
  process.exit(1);
});
