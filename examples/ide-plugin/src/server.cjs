const { Harbor } = require('harbord');

async function main() {
  const harbor = new Harbor();
  const self = await harbor.self('language-server');
  
  const port = 4000 + Math.floor(Math.random() * 1000);
  console.log(`Language Server starting on port ${port}...`);

  // Expose port to other clients
  await self.expose({ 
    port,
    version: '1.0.0',
    capabilities: ['completion', 'hover', 'definitions']
  });

  // Keep sending heartbeats
  setInterval(async () => {
    await self.alive();
  }, 5000);

  // Simple "server" that stays alive
  setInterval(() => {
    // console.log('Language Server is active');
  }, 10000);
}

main().catch(console.error);
