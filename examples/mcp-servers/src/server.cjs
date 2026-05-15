const { Harbor } = require('harbord');

async function main() {
  const name = process.argv[2] || 'mcp-server';
  const id = `${name}-mcp`;
  const harbor = new Harbor();
  const self = await harbor.self(id);
  
  const port = 5000 + Math.floor(Math.random() * 1000);
  console.log(`MCP Server ${name} starting on port ${port}...`);

  await self.expose({ 
    port,
    type: 'mcp',
    name: name
  });

  setInterval(async () => {
    await self.alive();
  }, 2000);
}

main().catch(console.error);
