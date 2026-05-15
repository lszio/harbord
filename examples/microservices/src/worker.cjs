const { Harbor } = require('harbord');

async function main() {
  const id = process.argv[2] || 'worker';
  const harbor = new Harbor();
  const self = await harbor.self(id);
  
  console.log(`Worker ${id} started`);

  setInterval(async () => {
    await self.alive();
  }, 1000);
}

main().catch(console.error);
