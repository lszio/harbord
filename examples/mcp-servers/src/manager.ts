import { Harbor } from 'harbord';
import { resolve } from 'path';

async function manageMCPServers() {
  const harbor = new Harbor();
  const serverPath = resolve(__dirname, 'server.cjs');

  try {
    const servers = ['sqlite', 'weather', 'github'];

    for (const name of servers) {
      console.log(`Starting MCP Server: ${name}...`);
      await harbor.service(`${name}-mcp`, {
        entry: serverPath,
        args: [name],
      });
    }

    console.log('\nActive MCP Servers:');
    
    for (const name of servers) {
      const svc = await harbor.service(`${name}-mcp`);
      // Wait briefly for metadata
      let retries = 0;
      while (!svc.state?.metadata?.port && retries < 10) {
        await new Promise(r => setTimeout(r, 500));
        await svc.refresh();
        retries++;
      }
      console.log(`- ${name}: ${svc.state?.status} (Port: ${svc.state?.metadata?.port || 'N/A'})`);
    }
  } finally {
    console.log('\nCleaning up...');
    await harbor.daemon.stop().catch(() => {});
    process.exit(0);
  }
}

manageMCPServers().catch(err => {
  console.error('MCP Manager Error:', err);
  process.exit(1);
});
